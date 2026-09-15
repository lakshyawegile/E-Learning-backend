const { Schema, model, Types } = require('mongoose');

/**
 * Outbox for the CRM lead webhook. One row per user, so the record doubles as
 * "have we already sent this person" and survives restarts mid-backoff.
 */
const crmLeadSyncSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: 'User', required: true, unique: true },
    phone: { type: String, default: '', trim: true },
    name: { type: String, default: '', trim: true },

    // signup = live hook, backfill = the one-time run
    source: { type: String, enum: ['signup', 'backfill'], default: 'signup' },

    //   PENDING        waiting for the next attempt
    //   SENT           201 or 200 — the CRM has it
    //   FAILED_INVALID 400, phone the CRM won't accept — never retried
    //   FAILED_TOKEN   404, token bad or disabled — never retried
    //   GAVE_UP        retries exhausted
    status: {
      type: String,
      enum: ['PENDING', 'SENT', 'FAILED_INVALID', 'FAILED_TOKEN', 'GAVE_UP'],
      default: 'PENDING',
      index: true,
    },

    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: null },
    lastStatusCode: { type: Number, default: null },
    lastError: { type: String, default: '' },

    // From their 201/200 response
    leadId: { type: String, default: '' },
    createdNewLead: { type: Boolean, default: false },
    sentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

crmLeadSyncSchema.index({ status: 1, nextAttemptAt: 1 });

module.exports = model('CrmLeadSync', crmLeadSyncSchema);
