const { Schema, model, Types } = require('mongoose');

/**
 * Recurring webinar push config, anchored to a seminar.
 * Admin picks the seminar + how long before each session to send; the schedule
 * itself comes from the seminar, so the two can never drift apart.
 * lastSentOccurrenceKey + sentOffsets prevent double-sending any one of a
 * rule's offsets for the same session.
 */
const scheduledWebinarNotificationSchema = new Schema(
  {
    organizationId: { type: Types.ObjectId, ref: 'Organization', required: true, index: true },
    createdBy: { type: Types.ObjectId, ref: 'User', default: null },

    // When to send, relative to each seminar session's start. One rule can fire
    // several times per session — e.g. [15, 0, -10] is "15 min before", "at the
    // start" and "10 min in" for someone who missed the first two.
    //   positive = that many minutes BEFORE the start
    //   zero     = exactly at the start
    //   negative = that many minutes AFTER the start
    // The seminar owns the schedule, so days/times are never entered here.
    // An "after" send is skipped once the session has ended.
    offsets: { type: [Number], default: [30] },

    // Superseded by `offsets`; still read as a fallback for rules saved before
    // multiple sends were supported.
    offsetMinutes: { type: Number, default: null },

    // Legacy — rules created before lead times had their own days/time. Kept
    // readable so old documents still load; no longer written or used.
    daysOfWeek: { type: [Number], default: [] },
    time: { type: String, default: '', trim: true },
    timezone: { type: String, default: 'Asia/Kolkata', trim: true },

    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    imageUrl: { type: String, default: '', trim: true },
    linkUrl: { type: String, default: '', trim: true },
    // Required — the linked seminar owns the meeting link/passcode and decides
    // the tap destination (linkUrl is always webinar://<seminarId>). Meeting
    // details are read from it at send time so they're never stale.
    seminarId: { type: Types.ObjectId, ref: 'Seminar', default: null },

    isActive: { type: Boolean, default: true, index: true },

    // The session we're currently tracking (ISO start) and which of this rule's
    // offsets have already gone out for it. Resets when a new session comes up.
    lastSentOccurrenceKey: { type: String, default: '' },
    sentOffsets: { type: [Number], default: [] },
    lastSentAt: { type: Date, default: null },
    lastSentCount: { type: Number, default: 0 },
    lastErrorMessage: { type: String, default: '' },
  },
  { timestamps: true }
);

scheduledWebinarNotificationSchema.index({ isActive: 1 });
scheduledWebinarNotificationSchema.index({ organizationId: 1, createdAt: -1 });

module.exports = model('ScheduledWebinarNotification', scheduledWebinarNotificationSchema);
