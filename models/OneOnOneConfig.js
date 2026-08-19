const { Schema, model, Types } = require('mongoose');

const benefitItemSchema = new Schema(
  {
    icon: { type: String, default: '', trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { _id: true }
);

const journeyStepSchema = new Schema(
  {
    icon: { type: String, default: '', trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { _id: true }
);

const uniquePointSchema = new Schema(
  {
    icon: { type: String, default: '', trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { _id: true }
);

const experienceVideoSchema = new Schema(
  {
    videoUrl: { type: String, required: true, trim: true },
    thumbnailUrl: { type: String, default: '', trim: true },
    duration: { type: String, default: '', trim: true },
    title: { type: String, required: true, trim: true },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { _id: true }
);

const trustBadgeSchema = new Schema(
  {
    icon: { type: String, default: '', trim: true },
    label: { type: String, required: true, trim: true },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { _id: true }
);

const highlightBannerItemSchema = new Schema(
  {
    icon: { type: String, default: '', trim: true },
    label: { type: String, required: true, trim: true },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { _id: true }
);

const highlightBannerSchema = new Schema(
  {
    heading: { type: String, default: '', trim: true },
    subheading: { type: String, default: '', trim: true },
    items: { type: [highlightBannerItemSchema], default: [] },
  },
  { _id: false }
);

const heroVideoSchema = new Schema(
  {
    videoUrl: { type: String, default: '', trim: true },
    thumbnailUrl: { type: String, default: '', trim: true },
    ctaText: { type: String, default: '', trim: true },
  },
  { _id: false }
);

const pricingSchema = new Schema(
  {
    heading: { type: String, default: '', trim: true },
    description: { type: String, default: '', trim: true },
    originalPrice: { type: String, default: '', trim: true },
    discountedPrice: { type: String, default: '', trim: true },
    priceNote: { type: String, default: '', trim: true },
    ctaText: { type: String, default: '', trim: true },
    // Tapping the CTA opens WhatsApp (wa.me/<number>) with this message pre-filled.
    ctaWhatsappNumber: { type: String, default: '', trim: true },
    ctaWhatsappMessage: { type: String, default: '', trim: true },
    // Scarcity/urgency display only — admin-set, not a real seat-inventory tracker.
    slotsLeft: { type: Number, default: 0 },
    urgencyText: { type: String, default: '', trim: true },
    // Small, low-emphasis fine print (e.g. "Course investment starts from X") so the
    // call isn't a price-reveal ambush — kept visually separate from the loud CTA/urgency line.
    disclaimerText: { type: String, default: '', trim: true },
  },
  { _id: false }
);

const oneOnOneConfigSchema = new Schema(
  {
    organizationId: { type: Types.ObjectId, ref: 'Organization', required: true },
    heading: { type: String, default: 'One-on-One Hand-Holding Classes', trim: true },
    subheading: { type: String, default: '', trim: true },
    heroVideo: { type: heroVideoSchema, default: () => ({}) },
    benefits: { type: [benefitItemSchema], default: [] },
    journeySteps: { type: [journeyStepSchema], default: [] },
    uniquePoints: { type: [uniquePointSchema], default: [] },
    highlightBanner: { type: highlightBannerSchema, default: () => ({}) },
    experienceVideos: { type: [experienceVideoSchema], default: [] },
    trustBadges: { type: [trustBadgeSchema], default: [] },
    pricing: { type: pricingSchema, default: () => ({}) },
    isActive: { type: Boolean, default: true },
    updatedBy: { type: Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

oneOnOneConfigSchema.index({ organizationId: 1 }, { unique: true });

module.exports = model('OneOnOneConfig', oneOnOneConfigSchema);
