const { Schema, model, Types } = require('mongoose');

/**
 * Recurring weekly webinar push config.
 * Admin picks daysOfWeek + time (IST). Cron fires every matching week.
 * lastSentOccurrenceKey prevents double-send in the same IST day.
 */
const scheduledWebinarNotificationSchema = new Schema(
  {
    organizationId: { type: Types.ObjectId, ref: 'Organization', required: true, index: true },
    createdBy: { type: Types.ObjectId, ref: 'User', default: null },

    // 0=Sunday ... 6=Saturday (same as JS Date.getDay / Seminar model)
    daysOfWeek: {
      type: [Number],
      required: true,
      validate: {
        validator: (arr) =>
          Array.isArray(arr) &&
          arr.length > 0 &&
          arr.every((d) => Number.isInteger(d) && d >= 0 && d <= 6),
        message: 'daysOfWeek must be a non-empty array of 0–6',
      },
    },
    // "HH:mm" in timezone (e.g. "19:00")
    time: { type: String, required: true, trim: true },
    timezone: { type: String, default: 'Asia/Kolkata', trim: true },

    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    imageUrl: { type: String, default: '', trim: true },
    linkUrl: { type: String, default: '', trim: true },
    seminarId: { type: Types.ObjectId, ref: 'Seminar', default: null },

    isActive: { type: Boolean, default: true, index: true },

    // e.g. "2026-07-15" — IST calendar date of last successful send
    lastSentOccurrenceKey: { type: String, default: '' },
    lastSentAt: { type: Date, default: null },
    lastSentCount: { type: Number, default: 0 },
    lastErrorMessage: { type: String, default: '' },
  },
  { timestamps: true }
);

scheduledWebinarNotificationSchema.index({ isActive: 1, time: 1 });
scheduledWebinarNotificationSchema.index({ organizationId: 1, createdAt: -1 });

module.exports = model('ScheduledWebinarNotification', scheduledWebinarNotificationSchema);
