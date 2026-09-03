const { Schema, model, Types } = require('mongoose');

/**
 * One-time (not recurring) admin broadcast notification, queued to send at a
 * future timestamp instead of immediately. Mirrors the payload shape of
 * POST /notifications/broadcast — see services/notificationBroadcast.js,
 * which both the immediate-send endpoint and jobs/scheduledNotificationCron.js
 * share to avoid duplicating targeting logic.
 */
const scheduledNotificationSchema = new Schema(
  {
    organizationId: { type: Types.ObjectId, ref: 'Organization', required: true, index: true },
    createdBy: { type: Types.ObjectId, ref: 'User', default: null },

    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    imageUrl: { type: String, default: '', trim: true },
    linkUrl: { type: String, default: '', trim: true },
    data: { type: Schema.Types.Mixed, default: null },

    // Same targeting shape as the immediate broadcast endpoint
    audience: { type: String, enum: ['all', 'custom', 'new'], default: 'all' },
    customUsers: { type: String, default: '' },
    newUser: { type: Schema.Types.Mixed, default: null }, // { mode: 'today'|'date', date?, days? }
    interestedIn: { type: String, enum: ['any', 'import', 'export'], default: 'any' },
    premium: { type: String, enum: ['any', 'premium', 'non-premium'], default: 'any' },

    scheduledFor: { type: Date, required: true, index: true },
    status: { type: String, enum: ['PENDING', 'SENDING', 'SENT', 'FAILED'], default: 'PENDING', index: true },
    sentAt: { type: Date, default: null },
    sentCount: { type: Number, default: 0 },
    lastErrorMessage: { type: String, default: '' },
  },
  { timestamps: true }
);

scheduledNotificationSchema.index({ status: 1, scheduledFor: 1 });
scheduledNotificationSchema.index({ organizationId: 1, createdAt: -1 });

module.exports = model('ScheduledNotification', scheduledNotificationSchema);
