const { PremiumFeaturesConfig } = require('../models');

const DEFAULTS = {
  heading: 'Go Premium',
  subheading: '',
  ctaText: 'Upgrade Now',
  ctaWhatsappNumber: '',
  ctaWhatsappMessage: '',
  bannerImageUrl: '',
  bannerText: '',
  gridColumns: 2,
  featuresHeading: "What You'll Get",
  instructorsHeading: 'Meet Your Teachers',
  videosHeading: 'Top Learning Videos',
  testimonialsHeading: 'Trusted By Thousands',
};

const DEFAULT_INTRO_VIDEO = {
  videoUrl: '',
  thumbnailUrl: '',
  title: '',
};

const DEFAULT_PRICING = {
  heading: 'Go Premium',
  description: '',
  benefits: [],
  offerBadgeText: '',
  originalPrice: '',
  discountedPrice: '',
  priceNote: '',
};

const VALID_GRID_COLUMNS = [2, 3, 4];
const BANNER_POSITIONS = ['after_hero', 'after_stats', 'after_features', 'after_videos', 'after_testimonials'];

const normalizeGridColumns = (value) => {
  const num = Number(value);
  return VALID_GRID_COLUMNS.includes(num) ? num : DEFAULTS.gridColumns;
};

const normalizeBannerPosition = (value) => (BANNER_POSITIONS.includes(value) ? value : BANNER_POSITIONS[0]);

// Shared order/isActive handling for every admin-editable list (features/stats/videos/testimonials).
const withOrderAndActive = (item, index, fields) => ({
  ...fields,
  order: Number.isFinite(Number(item?.order)) ? Number(item.order) : index + 1,
  isActive: item?.isActive === undefined ? true : Boolean(item.isActive),
});

// Shared read-side filter/sort/map for every admin-editable list.
const mapAndSort = (items, mapFn) => (items || [])
  .filter((i) => i.isActive !== false)
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  .map(mapFn);

const mapFeature = (f) => ({
  id: String(f._id || f.id || ''),
  icon: f.icon || '',
  imageUrl: f.imageUrl || '',
  title: f.title,
  description: f.description || '',
  order: f.order ?? 0,
});

const mapStat = (s) => ({
  id: String(s._id || s.id || ''),
  icon: s.icon || '',
  value: s.value,
  label: s.label,
  order: s.order ?? 0,
});

const mapVideo = (v) => ({
  id: String(v._id || v.id || ''),
  videoUrl: v.videoUrl,
  thumbnailUrl: v.thumbnailUrl || '',
  duration: v.duration || '',
  title: v.title,
  order: v.order ?? 0,
});

const mapTestimonial = (t) => ({
  id: String(t._id || t.id || ''),
  rating: t.rating ?? 5,
  quote: t.quote,
  name: t.name,
  avatarUrl: t.avatarUrl || '',
  order: t.order ?? 0,
});

const mapInstructor = (t) => ({
  id: String(t._id || t.id || ''),
  imageUrl: t.imageUrl || '',
  name: t.name || '',
  order: t.order ?? 0,
});

const mapBanner = (b) => ({
  id: String(b._id || b.id || ''),
  imageUrl: b.imageUrl,
  text: b.text || '',
  linkUrl: b.linkUrl || '',
  position: b.position,
  order: b.order ?? 0,
});

const normalizeIntroVideo = (v) => ({
  videoUrl: String(v?.videoUrl || '').trim(),
  thumbnailUrl: String(v?.thumbnailUrl || '').trim(),
  title: String(v?.title || '').trim(),
});

const normalizePricing = (p) => ({
  heading: String(p?.heading || '').trim() || DEFAULT_PRICING.heading,
  description: String(p?.description || '').trim(),
  benefits: Array.isArray(p?.benefits) ? p.benefits.map((b) => String(b || '').trim()).filter(Boolean) : [],
  offerBadgeText: String(p?.offerBadgeText || '').trim(),
  originalPrice: String(p?.originalPrice || '').trim(),
  discountedPrice: String(p?.discountedPrice || '').trim(),
  priceNote: String(p?.priceNote || '').trim(),
});

// GET /api/premium-features/config
const getPremiumFeaturesConfig = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(400).json({ message: 'User organization not found' });

    const config = await PremiumFeaturesConfig.findOne({ organizationId, isActive: true }).lean();

    return res.json({
      success: true,
      data: {
        heading: config?.heading || DEFAULTS.heading,
        subheading: config?.subheading ?? DEFAULTS.subheading,
        ctaText: config?.ctaText || DEFAULTS.ctaText,
        ctaWhatsappNumber: config?.ctaWhatsappNumber ?? DEFAULTS.ctaWhatsappNumber,
        ctaWhatsappMessage: config?.ctaWhatsappMessage ?? DEFAULTS.ctaWhatsappMessage,
        bannerImageUrl: config?.bannerImageUrl ?? DEFAULTS.bannerImageUrl,
        bannerText: config?.bannerText ?? DEFAULTS.bannerText,
        introVideo: config?.introVideo ? normalizeIntroVideo(config.introVideo) : DEFAULT_INTRO_VIDEO,
        gridColumns: normalizeGridColumns(config?.gridColumns),
        featuresHeading: config?.featuresHeading || DEFAULTS.featuresHeading,
        instructorsHeading: config?.instructorsHeading || DEFAULTS.instructorsHeading,
        videosHeading: config?.videosHeading || DEFAULTS.videosHeading,
        testimonialsHeading: config?.testimonialsHeading || DEFAULTS.testimonialsHeading,
        features: mapAndSort(config?.features, mapFeature),
        stats: mapAndSort(config?.stats, mapStat),
        videos: mapAndSort(config?.videos, mapVideo),
        testimonials: mapAndSort(config?.testimonials, mapTestimonial),
        instructors: mapAndSort(config?.instructors, mapInstructor),
        banners: mapAndSort(config?.banners, mapBanner),
        pricing: config?.pricing ? normalizePricing(config.pricing) : DEFAULT_PRICING,
      },
    });
  } catch (err) {
    console.error('getPremiumFeaturesConfig error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// PUT /api/premium-features/config (admin)
// Body: { heading?, subheading?, ctaText?, bannerImageUrl?, bannerText?, gridColumns?,
//   features?: [{ icon?, imageUrl?, title, description?, order?, isActive? }],
//   stats?: [{ icon?, value, label, order?, isActive? }],
//   videos?: [{ videoUrl, thumbnailUrl?, duration?, title, order?, isActive? }],
//   testimonials?: [{ rating?, quote, name, avatarUrl?, order?, isActive? }],
//   instructors?: [{ imageUrl?, name?, order?, isActive? }], // 16:9 photo card — everything optional
//   banners?: [{ imageUrl, text?, linkUrl?, position, order?, isActive? }],
//   introVideo?: { videoUrl?, thumbnailUrl?, title? },
//   pricing?: { heading?, description?, benefits?, offerBadgeText?, originalPrice?, discountedPrice?, priceNote? },
//   isActive? }
const upsertPremiumFeaturesConfig = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    const updatedBy = req.user?.userId || null;
    if (!organizationId) return res.status(400).json({ message: 'User organization not found' });

    const {
      heading, subheading, ctaText, ctaWhatsappNumber, ctaWhatsappMessage, bannerImageUrl, bannerText, gridColumns,
      featuresHeading, instructorsHeading, videosHeading, testimonialsHeading,
      features, stats, videos, testimonials, instructors, banners, introVideo, pricing, isActive,
    } = req.body || {};

    if (!Array.isArray(features)) {
      return res.status(400).json({ message: 'features must be an array' });
    }
    if (stats !== undefined && !Array.isArray(stats)) {
      return res.status(400).json({ message: 'stats must be an array' });
    }
    if (videos !== undefined && !Array.isArray(videos)) {
      return res.status(400).json({ message: 'videos must be an array' });
    }
    if (testimonials !== undefined && !Array.isArray(testimonials)) {
      return res.status(400).json({ message: 'testimonials must be an array' });
    }
    if (instructors !== undefined && !Array.isArray(instructors)) {
      return res.status(400).json({ message: 'instructors must be an array' });
    }
    if (banners !== undefined && !Array.isArray(banners)) {
      return res.status(400).json({ message: 'banners must be an array' });
    }

    const normalizedFeatures = features
      .map((f, index) => withOrderAndActive(f, index, {
        icon: String(f?.icon || '').trim(),
        imageUrl: String(f?.imageUrl || '').trim(),
        title: String(f?.title || '').trim(),
        description: String(f?.description || '').trim(),
      }))
      .filter((f) => f.title);

    const toSet = {
      organizationId,
      features: normalizedFeatures,
      updatedBy,
    };
    if (heading !== undefined) toSet.heading = String(heading || '').trim() || DEFAULTS.heading;
    if (subheading !== undefined) toSet.subheading = String(subheading || '').trim();
    if (ctaText !== undefined) toSet.ctaText = String(ctaText || '').trim() || DEFAULTS.ctaText;
    if (ctaWhatsappNumber !== undefined) toSet.ctaWhatsappNumber = String(ctaWhatsappNumber || '').trim();
    if (ctaWhatsappMessage !== undefined) toSet.ctaWhatsappMessage = String(ctaWhatsappMessage || '').trim();
    if (bannerImageUrl !== undefined) toSet.bannerImageUrl = String(bannerImageUrl || '').trim();
    if (bannerText !== undefined) toSet.bannerText = String(bannerText || '').trim();
    if (gridColumns !== undefined) toSet.gridColumns = normalizeGridColumns(gridColumns);
    if (featuresHeading !== undefined) toSet.featuresHeading = String(featuresHeading || '').trim() || DEFAULTS.featuresHeading;
    if (instructorsHeading !== undefined) toSet.instructorsHeading = String(instructorsHeading || '').trim() || DEFAULTS.instructorsHeading;
    if (videosHeading !== undefined) toSet.videosHeading = String(videosHeading || '').trim() || DEFAULTS.videosHeading;
    if (testimonialsHeading !== undefined) toSet.testimonialsHeading = String(testimonialsHeading || '').trim() || DEFAULTS.testimonialsHeading;
    if (isActive !== undefined) toSet.isActive = Boolean(isActive);

    if (stats !== undefined) {
      toSet.stats = stats
        .map((s, index) => withOrderAndActive(s, index, {
          icon: String(s?.icon || '').trim(),
          value: String(s?.value || '').trim(),
          label: String(s?.label || '').trim(),
        }))
        .filter((s) => s.value && s.label);
    }

    if (videos !== undefined) {
      toSet.videos = videos
        .map((v, index) => withOrderAndActive(v, index, {
          videoUrl: String(v?.videoUrl || '').trim(),
          thumbnailUrl: String(v?.thumbnailUrl || '').trim(),
          duration: String(v?.duration || '').trim(),
          title: String(v?.title || '').trim(),
        }))
        .filter((v) => v.videoUrl && v.title);
    }

    if (testimonials !== undefined) {
      toSet.testimonials = testimonials
        .map((t, index) => withOrderAndActive(t, index, {
          rating: Math.min(5, Math.max(1, Number.isFinite(Number(t?.rating)) ? Number(t.rating) : 5)),
          quote: String(t?.quote || '').trim(),
          name: String(t?.name || '').trim(),
          avatarUrl: String(t?.avatarUrl || '').trim(),
        }))
        .filter((t) => t.quote && t.name);
    }

    if (instructors !== undefined) {
      toSet.instructors = instructors
        .map((t, index) => withOrderAndActive(t, index, {
          imageUrl: String(t?.imageUrl || '').trim(),
          name: String(t?.name || '').trim(),
        }))
        // Everything is optional — only drop a row that's entirely blank.
        .filter((t) => t.imageUrl || t.name);
    }

    if (banners !== undefined) {
      toSet.banners = banners
        .map((b, index) => withOrderAndActive(b, index, {
          imageUrl: String(b?.imageUrl || '').trim(),
          text: String(b?.text || '').trim(),
          linkUrl: String(b?.linkUrl || '').trim(),
          position: normalizeBannerPosition(b?.position),
        }))
        .filter((b) => b.imageUrl);
    }

    if (introVideo !== undefined) {
      toSet.introVideo = normalizeIntroVideo(introVideo);
    }

    if (pricing !== undefined) {
      toSet.pricing = normalizePricing(pricing);
    }

    const saved = await PremiumFeaturesConfig.findOneAndUpdate(
      { organizationId },
      { $set: toSet },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    ).lean();

    return res.json({
      success: true,
      data: {
        heading: saved.heading,
        subheading: saved.subheading,
        ctaText: saved.ctaText,
        ctaWhatsappNumber: saved.ctaWhatsappNumber ?? DEFAULTS.ctaWhatsappNumber,
        ctaWhatsappMessage: saved.ctaWhatsappMessage ?? DEFAULTS.ctaWhatsappMessage,
        bannerImageUrl: saved.bannerImageUrl ?? DEFAULTS.bannerImageUrl,
        bannerText: saved.bannerText ?? DEFAULTS.bannerText,
        introVideo: saved.introVideo ? normalizeIntroVideo(saved.introVideo) : DEFAULT_INTRO_VIDEO,
        gridColumns: normalizeGridColumns(saved.gridColumns),
        featuresHeading: saved.featuresHeading || DEFAULTS.featuresHeading,
        instructorsHeading: saved.instructorsHeading || DEFAULTS.instructorsHeading,
        videosHeading: saved.videosHeading || DEFAULTS.videosHeading,
        testimonialsHeading: saved.testimonialsHeading || DEFAULTS.testimonialsHeading,
        features: mapAndSort(saved.features, mapFeature),
        stats: mapAndSort(saved.stats, mapStat),
        videos: mapAndSort(saved.videos, mapVideo),
        testimonials: mapAndSort(saved.testimonials, mapTestimonial),
        instructors: mapAndSort(saved.instructors, mapInstructor),
        banners: mapAndSort(saved.banners, mapBanner),
        pricing: saved.pricing ? normalizePricing(saved.pricing) : DEFAULT_PRICING,
        isActive: saved.isActive,
      },
    });
  } catch (err) {
    console.error('upsertPremiumFeaturesConfig error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  getPremiumFeaturesConfig,
  upsertPremiumFeaturesConfig,
};
