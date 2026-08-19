const mongoose = require('mongoose');
const { Schema } = mongoose;

// Reuse model if already registered elsewhere to avoid OverwriteModelError
if (mongoose.models.AnalyticsLogEvent) {
  module.exports = mongoose.models.AnalyticsLogEvent;
} else {
  const analyticsLogEventSchema = new Schema(
    {
      organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null },
      userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      event_name: { type: String, required: true, trim: true },
      parameters: { type: Schema.Types.Mixed, default: {} },
      phone_number: { type: String, default: '', trim: true },
      event_timestamp: { type: Date, required: true },
    },
    { timestamps: { createdAt: true, updatedAt: false } }
  );

  analyticsLogEventSchema.index({ organizationId: 1, event_timestamp: -1 });
  analyticsLogEventSchema.index({ event_name: 1, event_timestamp: -1 });
  analyticsLogEventSchema.index({ userId: 1, event_timestamp: -1 });
  analyticsLogEventSchema.index({ createdAt: 1 });

  module.exports = mongoose.model('AnalyticsLogEvent', analyticsLogEventSchema);
}

