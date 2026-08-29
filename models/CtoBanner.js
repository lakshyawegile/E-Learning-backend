const { Schema, model, Types } = require('mongoose');

const ctoBannerSchema = new Schema(
  {
    organizationId: { type: Types.ObjectId, ref: 'Organization', required: true },
    title: { type: String, required: true, trim: true }, // headline text
    type: { type: String, enum: ['CAROUSEL', 'INLINE'], default: 'CAROUSEL' }, // placement style
    description: { type: String, default: '' }, // optional supporting copy
    ctaText: { type: String, required: true, trim: true }, // button text
    ctaUrl: { type: String, required: true, trim: true }, // click target
    imageUrl: { type: String, default: '' }, // optional banner image
    isActive: { type: Boolean, default: true },
    createdBy: { type: Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

ctoBannerSchema.index({ organizationId: 1, createdAt: -1 });
ctoBannerSchema.index({ isActive: 1, createdAt: -1 });

module.exports = model('CtoBanner', ctoBannerSchema);

