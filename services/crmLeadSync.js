const { CrmLeadSync } = require('../models');
const logger = require('../utils/logger');

const BASE_URL = String(process.env.CRM_WEBHOOK_BASE_URL || '').trim().replace(/\/+$/, '');
const TOKEN = String(process.env.CRM_WEBHOOK_TOKEN || '').trim();
const ENABLED = String(process.env.CRM_WEBHOOK_ENABLED || 'true').toLowerCase() !== 'false';
const TIMEOUT_MS = Number(process.env.CRM_WEBHOOK_TIMEOUT_MS) || 10000;

// Their telecallers see this instead of a blank when we have no name on file.
const NAME_PLACEHOLDER = 'No name';

// Minutes to wait before each retry. Once we run out, the row is given up on.
const RETRY_SCHEDULE_MINUTES = [1, 5, 30];

const isConfigured = () => Boolean(BASE_URL && TOKEN);

// The token is the credential, so it must never reach the logs.
const safeEndpoint = () => `${BASE_URL}/api/webhooks/user-registered/<token>`;

const buildPayload = (user) => ({
  phone: String(user?.mobile || '').trim(),
  name: String(user?.name || '').trim() || NAME_PLACEHOLDER,
});

/**
 * One HTTP attempt. Returns how the caller should treat the outcome rather than
 * throwing, so both the live hook and the retry cron classify identically.
 *   { outcome: 'sent' | 'invalid' | 'bad_token' | 'retry', ... }
 */
async function postLead(payload) {
  let res;
  let bodyText = '';
  try {
    res = await fetch(`${BASE_URL}/api/webhooks/user-registered/${TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    bodyText = await res.text();
  } catch (err) {
    // Network failure / timeout — their side may be fine, so this is retryable
    return { outcome: 'retry', status: 0, error: String(err.message || err) };
  }

  let body = {};
  try {
    body = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    body = { raw: bodyText.slice(0, 200) };
  }

  // 201 = created, 200 = already existed. Both are success.
  if (res.status === 201 || res.status === 200) {
    return { outcome: 'sent', status: res.status, leadId: body.leadId || '', created: body.created === true };
  }
  // Bad phone — retrying will never help
  if (res.status === 400) {
    return { outcome: 'invalid', status: 400, error: body.error || 'Invalid phone' };
  }
  // Bad or disabled token — every call will fail until someone fixes it
  if (res.status === 404) {
    return { outcome: 'bad_token', status: 404, error: body.error || 'Not found' };
  }
  return { outcome: 'retry', status: res.status, error: body.error || `HTTP ${res.status}` };
}

function applyOutcome(row, result) {
  row.attempts += 1;
  row.lastStatusCode = result.status;

  if (result.outcome === 'sent') {
    row.status = 'SENT';
    row.sentAt = new Date();
    row.leadId = result.leadId || '';
    row.createdNewLead = !!result.created;
    row.lastError = '';
    return row;
  }

  row.lastError = String(result.error || '').slice(0, 300);

  if (result.outcome === 'invalid') {
    row.status = 'FAILED_INVALID';
    row.nextAttemptAt = null;
  } else if (result.outcome === 'bad_token') {
    row.status = 'FAILED_TOKEN';
    row.nextAttemptAt = null;
    logger.error(
      `[crmLeadSync] Webhook rejected the token (404) at ${safeEndpoint()} — ` +
      'every lead will fail until it is fixed. Check CRM_WEBHOOK_TOKEN.'
    );
  } else {
    const waitMinutes = RETRY_SCHEDULE_MINUTES[row.attempts - 1];
    if (waitMinutes === undefined) {
      row.status = 'GAVE_UP';
      row.nextAttemptAt = null;
      logger.error(`[crmLeadSync] Gave up on lead ${row._id} after ${row.attempts} attempts: ${row.lastError}`);
    } else {
      row.status = 'PENDING';
      row.nextAttemptAt = new Date(Date.now() + waitMinutes * 60 * 1000);
    }
  }
  return row;
}

/**
 * Records the lead and tries to deliver it once. Never throws — a CRM problem
 * must not surface in, or fail, the signup that triggered it.
 */
async function syncLead(user, source = 'signup') {
  try {
    if (!ENABLED) return { skipped: 'DISABLED' };
    if (!isConfigured()) {
      logger.error('[crmLeadSync] CRM_WEBHOOK_BASE_URL / CRM_WEBHOOK_TOKEN not set — lead not sent');
      return { skipped: 'NOT_CONFIGURED' };
    }

    const payload = buildPayload(user);
    if (!payload.phone) return { skipped: 'NO_PHONE' };

    // One row per user, so a re-run of the backfill updates rather than duplicates
    let row = await CrmLeadSync.findOne({ userId: user._id });
    if (row && row.status === 'SENT') return { skipped: 'ALREADY_SENT', leadId: row.leadId };
    if (!row) {
      row = new CrmLeadSync({ userId: user._id, phone: payload.phone, name: payload.name, source });
    }
    row.phone = payload.phone;
    row.name = payload.name;
    await row.save();

    const result = await postLead(payload);
    applyOutcome(row, result);
    await row.save();

    logger.info(
      `[crmLeadSync] ${payload.phone} -> ${result.status} ${row.status}` +
      (result.leadId ? ` leadId=${result.leadId} created=${result.created}` : '')
    );

    return { status: row.status, httpStatus: result.status, leadId: row.leadId, created: row.createdNewLead };
  } catch (err) {
    logger.error('[crmLeadSync] Unexpected failure:', err.message || err);
    return { skipped: 'ERROR', error: String(err.message || err) };
  }
}

/** Fire-and-forget entry point for the signup path — deliberately not awaited. */
function queueLead(user, source = 'signup') {
  syncLead(user, source).catch((err) =>
    logger.error('[crmLeadSync] queueLead failed:', err.message || err)
  );
}

module.exports = {
  syncLead,
  queueLead,
  postLead,
  applyOutcome,
  buildPayload,
  isConfigured,
  safeEndpoint,
  NAME_PLACEHOLDER,
  RETRY_SCHEDULE_MINUTES,
};
