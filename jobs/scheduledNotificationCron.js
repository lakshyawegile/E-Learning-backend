const cron = require('node-cron');
const { ScheduledNotification } = require('../models');
const { sendBroadcastNotification } = require('../services/notificationBroadcast');

// Fires at :00 and :30 of every hour — a real cron expression, so it's
// wall-clock aligned (not relative to when the process started), matching
// the 30-minute scheduling slots offered in the admin dashboard exactly.
const CRON_SCHEDULE = process.env.SCHEDULED_NOTIFICATION_CRON_SCHEDULE || '0,30 * * * *';
const CRON_TZ = process.env.SCHEDULED_NOTIFICATION_CRON_TZ || 'Asia/Kolkata';

let running = false;
let scheduledJob = null;

async function processDueScheduledNotifications() {
  const now = new Date();
  const due = await ScheduledNotification.find({
    status: 'PENDING',
    scheduledFor: { $lte: now },
  }).limit(50);

  if (!due.length) return { processed: 0 };

  let processed = 0;
  for (const item of due) {
    // Claim it so parallel workers don't double-send
    const claimed = await ScheduledNotification.findOneAndUpdate(
      { _id: item._id, status: 'PENDING' },
      { $set: { status: 'SENDING' } },
      { new: true }
    );
    if (!claimed) continue;

    try {
      const result = await sendBroadcastNotification(claimed.toObject());
      claimed.status = 'SENT';
      claimed.sentAt = new Date();
      claimed.sentCount = result.sentCount || 0;
      claimed.lastErrorMessage = '';
      await claimed.save();
      processed += 1;

      console.log(
        `[scheduledNotificationCron] Sent ${claimed._id} → ${claimed.sentCount} user(s)`
      );
    } catch (err) {
      console.error(`[scheduledNotificationCron] Failed ${claimed._id}:`, err.message || err);
      // Revert to PENDING so the next tick retries
      claimed.status = 'PENDING';
      claimed.lastErrorMessage = String(err.message || err).slice(0, 500);
      await claimed.save();
    }
  }

  return { processed };
}

function startScheduledNotificationCron() {
  if (scheduledJob) return scheduledJob;

  const enabled = String(process.env.SCHEDULED_NOTIFICATION_CRON_ENABLED || 'true').toLowerCase() !== 'false';
  if (!enabled) {
    console.log('[scheduledNotificationCron] Disabled via SCHEDULED_NOTIFICATION_CRON_ENABLED=false');
    return null;
  }

  if (!cron.validate(CRON_SCHEDULE)) {
    console.error('[scheduledNotificationCron] Invalid schedule:', CRON_SCHEDULE);
    return null;
  }

  scheduledJob = cron.schedule(
    CRON_SCHEDULE,
    async () => {
      if (running) return;
      running = true;
      try {
        await processDueScheduledNotifications();
      } catch (err) {
        console.error('[scheduledNotificationCron] error:', err.message || err);
      } finally {
        running = false;
      }
    },
    { timezone: CRON_TZ }
  );

  console.log(`[scheduledNotificationCron] Checker "${CRON_SCHEDULE}" (${CRON_TZ})`);
  return scheduledJob;
}

module.exports = {
  startScheduledNotificationCron,
  processDueScheduledNotifications,
};
