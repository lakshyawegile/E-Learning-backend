const { Schema, model, Types } = require('mongoose');

const BANNER_POSITIONS = ['after_hero', 'after_stats', 'after_features', 'after_videos', 'after_testimonials'];

const featureItemSchema = new Schema(
  {
    icon: { type: String, default: '', trim: true },
    imageUrl: { type: String, default: '', trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { _id: true }
);

const statItemSchema = new Schema(
  {
    icon: { type: String, default: '', trim: true },
    value: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { _id: true }
);

const videoItemSchema = new Schema(
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

const testimonialItemSchema = new Schema(
  {
    rating: { type: Number, default: 5, min: 1, max: 5 },
    quote: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    avatarUrl: { type: String, default: '', trim: true },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { _id: true }
);

const instructorItemSchema = new Schema(
  {
    videoUrl: { type: String, required: true, trim: true },
    thumbnailUrl: { type: String, default: '', trim: true },
    name: { type: String, required: true, trim: true },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { _id: true }
);

const bannerSlotSchema = new Schema(
  {
    imageUrl: { type: String, required: true, trim: true },
    text: { type: String, default: '', trim: true },
    linkUrl: { type: String, default: '', trim: true },
    position: { type: String, enum: BANNER_POSITIONS, required: true },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { _id: true }
);

const introVideoSchema = new Schema(
  {
    videoUrl: { type: String, default: '', trim: true },
    thumbnailUrl: { type: String, default: '', trim: true },
    title: { type: String, default: '', trim: true },
  },
  { _id: false }
);

const pricingSchema = new Schema(
  {
    heading: { type: String, default: 'Go Premium', trim: true },
    description: { type: String, default: '', trim: true },
    benefits: { type: [String], default: [] },
    offerBadgeText: { type: String, default: '', trim: true },
    originalPrice: { type: String, default: '', trim: true },
    discountedPrice: { type: String, default: '', trim: true },
    priceNote: { type: String, default: '', trim: true },
  },
  { _id: false }
);

const premiumFeaturesConfigSchema = new Schema(
  {
    organizationId: { type: Types.ObjectId, ref: 'Organization', required: true },
    heading: { type: String, default: 'Go Premium', trim: true },
    subheading: { type: String, default: '', trim: true },
    ctaText: { type: String, default: 'Upgrade Now', trim: true },
    // Tapping the CTA opens WhatsApp (wa.me/<number>) with this message pre-filled.
    ctaWhatsappNumber: { type: String, default: '', trim: true },
    ctaWhatsappMessage: { type: String, default: '', trim: true },
    bannerImageUrl: { type: String, default: '', trim: true },
    bannerText: { type: String, default: '', trim: true },
    introVideo: { type: introVideoSchema, default: () => ({}) },
    gridColumns: { type: Number, enum: [2, 3, 4], default: 2 },
    // On-page section headings — admin-editable text shown in the app above each list section.
    featuresHeading: { type: String, default: "What You'll Get", trim: true },
    instructorsHeading: { type: String, default: 'Meet Your Teachers', trim: true },
    videosHeading: { type: String, default: 'Top Learning Videos', trim: true },
    testimonialsHeading: { type: String, default: 'Trusted By Thousands', trim: true },
    features: { type: [featureItemSchema], default: [] },
    stats: { type: [statItemSchema], default: [] },
    videos: { type: [videoItemSchema], default: [] },
    testimonials: { type: [testimonialItemSchema], default: [] },
    instructors: { type: [instructorItemSchema], default: [] },
    banners: { type: [bannerSlotSchema], default: [] },
    pricing: { type: pricingSchema, default: () => ({}) },
    isActive: { type: Boolean, default: true },
    updatedBy: { type: Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

premiumFeaturesConfigSchema.index({ organizationId: 1 }, { unique: true });

module.exports = model('PremiumFeaturesConfig', premiumFeaturesConfigSchema);
