const { Schema, model, Types } = require('mongoose');

// One day + its own time. Lets a seminar run Sunday 20:00 and Monday 18:30,
// which the flat daysOfWeek + single time below could never express.
const slotSchema = new Schema(
  {
    dayOfWeek: { type: Number, required: true, min: 0, max: 6 }, // 0=Sunday
    time: { type: String, required: true, trim: true }, // "HH:mm" in schedule.timezone
    durationMinutes: { type: Number, default: 60 },
  },
  { _id: false }
);

const scheduleSchema = new Schema(
  {
    // Only "weekly" supported for now (Tue/Thu/Sun etc.), can be extended later.
    type: { type: String, enum: ['weekly'], default: 'weekly' },

    // Authoritative when non-empty.
    slots: { type: [slotSchema], default: [] },

    // Legacy shape — one time shared by every day. Still written as a mirror of
    // `slots` so older readers keep working; `slots` wins when both are present.
    // 0=Sunday ... 6=Saturday
    daysOfWeek: { type: [Number], default: [] },
    // "HH:mm" in the given timezone (e.g., "19:00")
    time: { type: String, default: '19:00', trim: true },
    durationMinutes: { type: Number, default: 60 },

    timezone: { type: String, default: 'Asia/Kolkata', trim: true },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
  },
  { _id: false }
);

const seminarSchema = new Schema(
  {
    organizationId: { type: Types.ObjectId, ref: 'Organization', required: true, index: true },
    title: { type: String, default: '', trim: true },
    description: { type: String, default: '', trim: true },
    bannerImageUrl: { type: String, default: '', trim: true },
    meetingUrl: { type: String, default: '', trim: true }, // Zoom/Meet/YouTube live etc.
    meetingPasscode: { type: String, default: '', trim: true },

    schedule: { type: scheduleSchema, default: () => ({}) },

    isActive: { type: Boolean, default: true },
    createdBy: { type: Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

seminarSchema.index({ organizationId: 1, isActive: 1, createdAt: -1 });

module.exports = model('Seminar', seminarSchema);

