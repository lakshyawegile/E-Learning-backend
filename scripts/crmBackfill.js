/**
 * One-time CRM backfill — sends the N most recent USER accounts to the lead webhook.
 *
 *   node scripts/crmBackfill.js --limit 1            # send just the newest (smoke test)
 *   node scripts/crmBackfill.js --limit 50           # top up to 50; already-sent are skipped
 *   node scripts/crmBackfill.js --limit 50 --dry-run # show who would be sent, send nothing
 *
 * Idempotent: anyone with a SENT row in CrmLeadSync is skipped, so re-running
 * never double-sends. Deliberately a manual script, never run on boot.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { User, CrmLeadSync } = require('../models');
const { syncLead, buildPayload, isConfigured, safeEndpoint } = require('../services/crmLeadSync');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const has = (name) => process.argv.includes(`--${name}`);

(async () => {
  const limit = Math.max(1, parseInt(arg('limit', '50'), 10) || 50);
  const dryRun = has('dry-run');

  if (!isConfigured()) {
    console.error('CRM_WEBHOOK_BASE_URL / CRM_WEBHOOK_TOKEN are not set. Aborting.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

  const users = await User.find({ role: 'USER' })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select('_id name mobile createdAt')
    .lean();

  const alreadySent = new Set(
    (await CrmLeadSync.find({ userId: { $in: users.map((u) => u._id) }, status: 'SENT' })
      .select('userId')
      .lean()).map((r) => String(r.userId))
  );

  const todo = users.filter((u) => !alreadySent.has(String(u._id)));

  console.log(`Endpoint : ${safeEndpoint()}`);
  console.log(`Scope    : ${limit} most recent role=USER`);
  console.log(`Skipping : ${alreadySent.size} already sent`);
  console.log(`To send  : ${todo.length}${dryRun ? '  (DRY RUN — nothing will be sent)' : ''}`);
  console.log('');

  if (dryRun) {
    todo.forEach((u, i) => {
      const p = buildPayload(u);
      console.log(`  ${String(i + 1).padStart(2)}. ${p.phone.padEnd(14)} ${p.name}`);
    });
    await mongoose.disconnect();
    process.exit(0);
  }

  const tally = {};
  for (let i = 0; i < todo.length; i += 1) {
    const u = todo[i];
    const p = buildPayload(u);
    // Sequential on purpose — 50 calls, and it keeps their side unstressed
    const res = await syncLead(u, 'backfill');
    const code = res.httpStatus ?? res.skipped ?? 'ERR';
    tally[code] = (tally[code] || 0) + 1;
    console.log(
      `  ${String(i + 1).padStart(2)}/${todo.length}  ${p.phone.padEnd(14)} ${String(code).padEnd(5)} ` +
      `${res.status || ''} ${res.leadId ? `leadId=${res.leadId}` : ''}${res.created === false ? ' (already existed)' : ''}`
    );
  }

  console.log('');
  console.log('Response code breakdown:');
  Object.entries(tally).forEach(([code, n]) => console.log(`  ${String(code).padEnd(6)} ${n}`));

  await mongoose.disconnect();
  process.exit(0);
})().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
