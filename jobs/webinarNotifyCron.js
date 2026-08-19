const cron = require('node-cron');
const { ScheduledWebinarNotification } = require('../models');
const { notifyAllUsersAboutWebinar } = require('../services/webinarNotify');

// Check every minute; fire when IST day + HH:mm match an active recurring rule
const CRON_SCHEDULE = process.env.WEBINAR_NOTIFY_CRON_SCHEDULE || '* * * * *';
const CRON_TZ = process.env.WEBINAR_NOTIFY_CRON_TZ || 'Asia/Kolkata';

let running = false;
let scheduledJob = null;

/**
 * Current calendar parts in Asia/Kolkata.
 * dayOfWeek: 0=Sun … 6=Sat, time: "HH:mm", dateKey: "YYYY-MM-DD"
 */
function getTimezoneParts(date = new Date(), timeZone = 'Asia/Kolkata') {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  });

  const parts = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }

  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  let hour = parts.hour || '00';
  if (hour === '24') hour = '00';

  return {
    dayOfWeek: weekdayMap[parts.weekday],
    time: `${String(hour).padStart(2, '0')}:${parts.minute}`,
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

async function processDueWebinarNotifications() {
  const { dayOfWeek, time, dateKey } = getTimezoneParts(new Date(), CRON_TZ);
  if (dayOfWeek === undefined || !time) return { processed: 0, skipped: 'BAD_CLOCK' };

  const due = await ScheduledWebinarNotification.find({
    isActive: true,
    time,
    daysOfWeek: dayOfWeek,
    lastSentOccurrenceKey: { $ne: dateKey },
  }).limit(50);

  if (!due.length) return { processed: 0, dayOfWeek, time, dateKey };

  let processed = 0;
  for (const job of due) {
    // Claim this occurrence so parallel workers don't double-send
    const claimed = await ScheduledWebinarNotification.findOneAndUpdate(
      {
        _id: job._id,
        isActive: true,
        lastSentOccurrenceKey: { $ne: dateKey },
      },
      {
        $set: {
          lastSentOccurrenceKey: dateKey,
          lastSentAt: new Date(),
          lastErrorMessage: '',
        },
      },
      { new: true }
    );
    if (!claimed) continue;

    try {
      const result = await notifyAllUsersAboutWebinar({
        title: claimed.title,
        body: claimed.body,
        imageUrl: claimed.imageUrl,
        linkUrl: claimed.linkUrl,
        seminarId: claimed.seminarId,
      });

      claimed.lastSentCount = result.sentCount || 0;
      claimed.lastErrorMessage = '';
      await claimed.save();
      processed += 1;

      console.log(
        `[webinarNotifyCron] Recurring send ${claimed._id} (${dateKey} ${time}) → ${claimed.lastSentCount} user(s)`
      );
    } catch (err) {
      console.error(`[webinarNotifyCron] Failed ${claimed._id}:`, err.message || err);
      // Allow retry later same day by clearing claim key on failure
      claimed.lastSentOccurrenceKey = '';
      claimed.lastErrorMessage = String(err.message || err).slice(0, 500);
      await claimed.save();
    }
  }

  return { processed, dayOfWeek, time, dateKey };
}

function startWebinarNotifyCron() {
  if (scheduledJob) return scheduledJob;

  const enabled = String(process.env.WEBINAR_NOTIFY_CRON_ENABLED || 'true').toLowerCase() !== 'false';
  if (!enabled) {
    console.log('[webinarNotifyCron] Disabled via WEBINAR_NOTIFY_CRON_ENABLED=false');
    return null;
  }

  if (!cron.validate(CRON_SCHEDULE)) {
    console.error('[webinarNotifyCron] Invalid schedule:', CRON_SCHEDULE);
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
        console.error('[webinarNotifyCron] error:', err.message || err);
      } finally {
        running = false;
      }
    },
    { timezone: CRON_TZ }
  );

  console.log(`[webinarNotifyCron] Recurring weekly checker "${CRON_SCHEDULE}" (${CRON_TZ})`);
  return scheduledJob;
}

module.exports = {
  startWebinarNotifyCron,
  processDueWebinarNotifications,
  getTimezoneParts,
};
