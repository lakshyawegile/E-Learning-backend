const cron = require('node-cron');
const { CrmLeadSync } = require('../models');
const { postLead, applyOutcome, isConfigured } = require('../services/crmLeadSync');
const logger = require('../utils/logger');

// Every minute; rows carry their own nextAttemptAt so the actual spacing is
// the 1m / 5m / 30m backoff, not this tick rate.
const CRON_SCHEDULE = process.env.CRM_RETRY_CRON_SCHEDULE || '* * * * *';

let running = false;
let scheduledJob = null;

async function processPendingLeads() {
  if (!isConfigured()) return { processed: 0, skipped: 'NOT_CONFIGURED' };

  const now = new Date();
  const due = await CrmLeadSync.find({
    status: 'PENDING',
    nextAttemptAt: { $ne: null, $lte: now },
  }).limit(50);

  if (!due.length) return { processed: 0 };

  let processed = 0;
  for (const row of due) {
    // Claim it so a slow attempt isn't picked up again by the next tick
    const claimed = await CrmLeadSync.findOneAndUpdate(
      { _id: row._id, status: 'PENDING', nextAttemptAt: { $lte: now } },
      { $set: { nextAttemptAt: null } },
      { new: true }
    );
    if (!claimed) continue;

    const result = await postLead({ phone: claimed.phone, name: claimed.name });
    applyOutcome(claimed, result);
    await claimed.save();
    processed += 1;

    logger.info(
      `[crmLeadRetryCron] retry ${claimed.phone} attempt ${claimed.attempts} -> ` +
      `${result.status} ${claimed.status}`
    );
  }

  return { processed };
}

function startCrmLeadRetryCron() {
  if (scheduledJob) return scheduledJob;

  const enabled = String(process.env.CRM_WEBHOOK_ENABLED || 'true').toLowerCase() !== 'false';
  if (!enabled) {
    logger.info('[crmLeadRetryCron] Disabled via CRM_WEBHOOK_ENABLED=false');
    return null;
  }
  if (!cron.validate(CRON_SCHEDULE)) {
    logger.error('[crmLeadRetryCron] Invalid schedule:', CRON_SCHEDULE);
    return null;
  }

  scheduledJob = cron.schedule(CRON_SCHEDULE, async () => {
    if (running) return;
    running = true;
    try {
      await processPendingLeads();
    } catch (err) {
      logger.error('[crmLeadRetryCron] error:', err.message || err);
    } finally {
      running = false;
    }
  });

  logger.info(`[crmLeadRetryCron] CRM lead retry checker "${CRON_SCHEDULE}"`);
  return scheduledJob;
}

module.exports = { startCrmLeadRetryCron, processPendingLeads };
