const { Schema, model, Types } = require('mongoose');

const INPUT_TYPES = ['text', 'dropdown', 'both'];
const BANNER_ACTIONS = ['open_questionnaire', 'whatsapp', 'call', 'internal', 'external_url', 'none'];
const USER_FIELD_MAPPINGS = ['name', 'interestedIn', ''];

const questionSchema = new Schema(
  {
    // Stable slug the answers point at — rename the label freely, never the key
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    helperText: { type: String, default: '', trim: true },
    inputType: { type: String, enum: INPUT_TYPES, default: 'text' },
    // Used by 'dropdown' and 'both'
    options: { type: [String], default: [] },
    required: { type: Boolean, default: true },
    order: { type: Number, default: 1 },
    maxLength: { type: Number, default: 200 },
    // Mirrors the answer onto the User doc so existing features keep working
    mapsToUserField: { type: String, enum: USER_FIELD_MAPPINGS, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

const bannerSchema = new Schema(
  {
    title: { type: String, default: '', trim: true },
    subtitle: { type: String, default: '', trim: true },
    // Shown on the right half of the banner; blank renders text-only
    imageUrl: { type: String, default: '', trim: true },
    ctaLabel: { type: String, default: '', trim: true },
    action: { type: String, enum: BANNER_ACTIONS, default: 'none' },
    // whatsapp -> number (blank falls back to SocialLinksConfig), call -> number,
    // internal -> screen key, external_url -> https link
    actionValue: { type: String, default: '', trim: true },
    isVisible: { type: Boolean, default: true },
  },
  { _id: false }
);

const profileQuestionConfigSchema = new Schema(
  {
    organizationId: { type: Types.ObjectId, ref: 'Organization', required: true, index: true },
    version: { type: Number, default: 1 },
    isActive: { type: Boolean, default: true },

    // Shown while the user still has required questions left
    incompleteBanner: {
      type: bannerSchema,
      default: () => ({
        title: 'Complete your profile',
        subtitle: 'Tell us about your business so our team can guide you',
        ctaLabel: 'Complete now',
        action: 'open_questionnaire',
        isVisible: true,
      }),
    },
    // Replaces the banner above once every required question is answered
    completeBanner: {
      type: bannerSchema,
      default: () => ({
        title: 'Need help? Call us 24/7',
        subtitle: 'Our export advisors are a message away',
        ctaLabel: 'Chat on WhatsApp',
        action: 'whatsapp',
        actionValue: '',
        isVisible: true,
      }),
    },

    questions: { type: [questionSchema], default: [] },
  },
  { timestamps: true }
);

profileQuestionConfigSchema.index({ organizationId: 1 }, { unique: true });

module.exports = model('ProfileQuestionConfig', profileQuestionConfigSchema);
module.exports.INPUT_TYPES = INPUT_TYPES;
module.exports.BANNER_ACTIONS = BANNER_ACTIONS;
module.exports.USER_FIELD_MAPPINGS = USER_FIELD_MAPPINGS;
