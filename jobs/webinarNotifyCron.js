const cron = require('node-cron');
const { ScheduledWebinarNotification, Seminar } = require('../models');
const { notifyAllUsersAboutWebinar } = require('../services/webinarNotify');
const { buildNextOccurrenceUTC } = require('../utils/seminarOccurrence');
const logger = require('../utils/logger');

// Check every minute; each rule fires once per seminar session, at its offset.
const CRON_SCHEDULE = process.env.WEBINAR_NOTIFY_CRON_SCHEDULE || '* * * * *';
const CRON_TZ = process.env.WEBINAR_NOTIFY_CRON_TZ || 'Asia/Kolkata';

const IST_TZ = 'Asia/Kolkata';
const formatTimeIST = (d) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: IST_TZ, hour: 'numeric', minute: '2-digit', hour12: true }).format(d);
const formatDayNameIST = (d) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: IST_TZ, weekday: 'long' }).format(d);
const formatDateIST = (d) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: IST_TZ, day: '2-digit', month: 'long' }).format(d);

let running = false;
let scheduledJob = null;

/**
 * Lets the admin write copy once and have it read correctly for every session:
 * "Join us {day} at {time}" -> "Join us Sunday at 8:00 pm".
 */
function relativeWhen(offsetMinutes) {
  if (!Number.isFinite(offsetMinutes) || offsetMinutes <= 0) return 'now';
  if (offsetMinutes < 60) return `in ${offsetMinutes} minutes`;
  if (offsetMinutes < 1440) {
    const h = Math.round(offsetMinutes / 60);
    return `in ${h} hour${h === 1 ? '' : 's'}`;
  }
  const d = Math.round(offsetMinutes / 1440);
  return `in ${d} day${d === 1 ? '' : 's'}`;
}

function applyPlaceholders(text, { startUTC, seminarTitle, offsetMinutes }) {
  return String(text || '')
    .replace(/\{when\}/gi, relativeWhen(offsetMinutes))
    .replace(/\{time\}/gi, formatTimeIST(startUTC))
    .replace(/\{day\}/gi, formatDayNameIST(startUTC))
    .replace(/\{date\}/gi, formatDateIST(startUTC))
    .replace(/\{title\}/gi, seminarTitle || '');
}

async function processDueWebinarNotifications() {
  const now = new Date();

  const rules = await ScheduledWebinarNotification.find({
    isActive: true,
    seminarId: { $ne: null },
  }).limit(100);

  if (!rules.length) return { processed: 0 };

  let processed = 0;

  for (const rule of rules) {
    // The seminar owns the schedule — no seminar (or a deactivated one) means
    // there is nothing to remind anyone about.
    const seminar = await Seminar.findOne({ _id: rule.seminarId, isActive: true }).lean();
    if (!seminar) continue;

    const occ = buildNextOccurrenceUTC({ now, schedule: seminar.schedule });
    if (!occ) continue;

    const minutesUntilStart = (occ.startUTC.getTime() - now.getTime()) / 60000;
    const occurrenceKey = occ.startUTC.toISOString();

    // A rule may fire several times per session. Fall back to the old single
    // field for rules saved before multiple offsets existed.
    const offsets = Array.isArray(rule.offsets) && rule.offsets.length
      ? rule.offsets
      : [Number.isFinite(rule.offsetMinutes) ? rule.offsetMinutes : 30];

    // New session — forget which offsets went out for the previous one.
    if (rule.lastSentOccurrenceKey !== occurrenceKey) {
      await ScheduledWebinarNotification.updateOne(
        { _id: rule._id, lastSentOccurrenceKey: { $ne: occurrenceKey } },
        { $set: { lastSentOccurrenceKey: occurrenceKey, sentOffsets: [] } }
      );
      rule.sentOffsets = [];
    }

    // Never send for a session that has already finished — this is what stops an
    // "after start" reminder going out once everyone has gone home.
    if (now > occ.endUTC) continue;

    for (const rawOffset of offsets) {
      const offsetMinutes = Number(rawOffset);
      if (!Number.isFinite(offsetMinutes)) continue;

      // Positive offset = send before the start, negative = after it has begun.
      // minutesUntilStart goes negative once a session is under way, so the same
      // comparison covers both directions.
      if (minutesUntilStart > offsetMinutes) continue;

      // Claim this one offset for this one session; whoever wins the update sends.
      const claimed = await ScheduledWebinarNotification.findOneAndUpdate(
        {
          _id: rule._id,
          isActive: true,
          lastSentOccurrenceKey: occurrenceKey,
          sentOffsets: { $ne: offsetMinutes },
        },
        {
          $addToSet: { sentOffsets: offsetMinutes },
          $set: { lastSentAt: new Date(), lastErrorMessage: '' },
        },
        { new: true }
      );
      if (!claimed) continue;

      try {
        const context = {
          startUTC: occ.startUTC,
          seminarTitle: seminar.title,
          offsetMinutes,
        };

        const result = await notifyAllUsersAboutWebinar({
          title: applyPlaceholders(claimed.title, context),
          body: applyPlaceholders(claimed.body, context),
          imageUrl: claimed.imageUrl,
          linkUrl: claimed.linkUrl,
          seminarId: claimed.seminarId,
          // Read fresh from the seminar so editing it updates every alert at once
          meetingUrl: seminar.meetingUrl || '',
          meetingPasscode: seminar.meetingPasscode || '',
        });

        claimed.lastSentCount = result.sentCount || 0;
        await claimed.save();
        processed += 1;

        const when =
          offsetMinutes > 0 ? `${offsetMinutes}m before`
            : offsetMinutes === 0 ? 'at start'
              : `${-offsetMinutes}m after start`;
        logger.info(
          `[webinarNotifyCron] Sent ${claimed._id} for session ${occurrenceKey} ` +
          `(${when}) → ${claimed.lastSentCount} user(s)`
        );
      } catch (err) {
        logger.error(`[webinarNotifyCron] Failed ${rule._id} @${offsetMinutes}:`, err.message || err);
        // Release just this offset so the next tick retries it, while any other
        // offsets already sent for this session stay sent.
        await ScheduledWebinarNotification.updateOne(
          { _id: rule._id },
          {
            $pull: { sentOffsets: offsetMinutes },
            $set: { lastErrorMessage: String(err.message || err).slice(0, 500) },
          }
        );
      }
    }
  }

  return { processed };
}

function startWebinarNotifyCron() {
  if (scheduledJob) return scheduledJob;

  const enabled = String(process.env.WEBINAR_NOTIFY_CRON_ENABLED || 'true').toLowerCase() !== 'false';
  if (!enabled) {
    logger.info('[webinarNotifyCron] Disabled via WEBINAR_NOTIFY_CRON_ENABLED=false');
    return null;
  }

  if (!cron.validate(CRON_SCHEDULE)) {
    logger.error('[webinarNotifyCron] Invalid schedule:', CRON_SCHEDULE);
    return null;
  }

  scheduledJob = cron.schedule(
    CRON_SCHEDULE,
    async () => {
      if (running) return;
      running = true;
      try {
        await processDueWebinarNotifications();
      } catch (err) {
        logger.error('[webinarNotifyCron] error:', err.message || err);
      } finally {
        running = false;
      }
    },
    { timezone: CRON_TZ }
  );

  logger.info(`[webinarNotifyCron] Seminar reminder checker "${CRON_SCHEDULE}" (${CRON_TZ})`);
  return scheduledJob;
}

module.exports = {
  startWebinarNotifyCron,
  processDueWebinarNotifications,
  applyPlaceholders,
  relativeWhen,
};
