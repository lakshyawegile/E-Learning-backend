const { Schema, model, Types } = require('mongoose');

const answerSchema = new Schema(
  {
    questionKey: { type: String, required: true, trim: true },
    inputType: { type: String, default: 'text', trim: true },
    // 'dropdown' fills optionValue, 'text' fills textValue, 'both' may fill either or both
    optionValue: { type: String, default: '', trim: true },
    textValue: { type: String, default: '', trim: true },
    answeredAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const userProfileAnswersSchema = new Schema(
  {
    organizationId: { type: Types.ObjectId, ref: 'Organization', required: true, index: true },
    userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    configVersion: { type: Number, default: 1 },

    answers: { type: [answerSchema], default: [] },

    // Denormalised cache — recomputed on every write, derived from required questions only
    completionPercentage: { type: Number, default: 0, min: 0, max: 100 },
    isComplete: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

userProfileAnswersSchema.index({ organizationId: 1, userId: 1 }, { unique: true });

module.exports = model('UserProfileAnswers', userProfileAnswersSchema);
