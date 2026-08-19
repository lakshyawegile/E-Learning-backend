const { OneOnOneConfig } = require('../models');

const DEFAULTS = {
  heading: 'One-on-One Hand-Holding Classes',
  subheading: '',
};

const DEFAULT_HERO_VIDEO = { videoUrl: '', thumbnailUrl: '', ctaText: '' };
const DEFAULT_HIGHLIGHT_BANNER = { heading: '', subheading: '', items: [] };
const DEFAULT_PRICING = {
  heading: '', description: '', originalPrice: '', discountedPrice: '', priceNote: '', ctaText: '',
  ctaWhatsappNumber: '', ctaWhatsappMessage: '',
  slotsLeft: 0, urgencyText: '', disclaimerText: '',
};

// Shared order/isActive handling for every admin-editable list.
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

const mapBenefit = (b) => ({
  id: String(b._id || b.id || ''),
  icon: b.icon || '',
  title: b.title,
  description: b.description || '',
  order: b.order ?? 0,
});

const mapJourneyStep = (j) => ({
  id: String(j._id || j.id || ''),
  icon: j.icon || '',
  title: j.title,
  description: j.description || '',
  order: j.order ?? 0,
});

const mapUniquePoint = (u) => ({
  id: String(u._id || u.id || ''),
  icon: u.icon || '',
  title: u.title,
  description: u.description || '',
  order: u.order ?? 0,
});

const mapExperienceVideo = (v) => ({
  id: String(v._id || v.id || ''),
  videoUrl: v.videoUrl,
  thumbnailUrl: v.thumbnailUrl || '',
  duration: v.duration || '',
  title: v.title,
  order: v.order ?? 0,
});

const mapTrustBadge = (t) => ({
  id: String(t._id || t.id || ''),
  icon: t.icon || '',
  label: t.label,
  order: t.order ?? 0,
});

const mapHighlightBannerItem = (i) => ({
  id: String(i._id || i.id || ''),
  icon: i.icon || '',
  label: i.label,
  order: i.order ?? 0,
});

const normalizeHeroVideo = (v) => ({
  videoUrl: String(v?.videoUrl || '').trim(),
  thumbnailUrl: String(v?.thumbnailUrl || '').trim(),
  ctaText: String(v?.ctaText || '').trim(),
});

const normalizePricing = (p) => ({
  heading: String(p?.heading || '').trim(),
  description: String(p?.description || '').trim(),
  originalPrice: String(p?.originalPrice || '').trim(),
  discountedPrice: String(p?.discountedPrice || '').trim(),
  priceNote: String(p?.priceNote || '').trim(),
  ctaText: String(p?.ctaText || '').trim(),
  ctaWhatsappNumber: String(p?.ctaWhatsappNumber || '').trim(),
  ctaWhatsappMessage: String(p?.ctaWhatsappMessage || '').trim(),
  slotsLeft: Number.isFinite(Number(p?.slotsLeft)) ? Math.max(0, Number(p.slotsLeft)) : 0,
  urgencyText: String(p?.urgencyText || '').trim(),
  disclaimerText: String(p?.disclaimerText || '').trim(),
});

// GET /api/one-on-one/config
const getOneOnOneConfig = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(400).json({ message: 'User organization not found' });

    const config = await OneOnOneConfig.findOne({ organizationId, isActive: true }).lean();

    return res.json({
      success: true,
      data: {
        heading: config?.heading || DEFAULTS.heading,
        subheading: config?.subheading ?? DEFAULTS.subheading,
        heroVideo: config?.heroVideo ? normalizeHeroVideo(config.heroVideo) : DEFAULT_HERO_VIDEO,
        benefits: mapAndSort(config?.benefits, mapBenefit),
        journeySteps: mapAndSort(config?.journeySteps, mapJourneyStep),
        uniquePoints: mapAndSort(config?.uniquePoints, mapUniquePoint),
        highlightBanner: config?.highlightBanner
          ? {
            heading: config.highlightBanner.heading || '',
            subheading: config.highlightBanner.subheading || '',
            items: mapAndSort(config.highlightBanner.items, mapHighlightBannerItem),
          }
          : DEFAULT_HIGHLIGHT_BANNER,
        experienceVideos: mapAndSort(config?.experienceVideos, mapExperienceVideo),
        trustBadges: mapAndSort(config?.trustBadges, mapTrustBadge),
        pricing: config?.pricing ? normalizePricing(config.pricing) : DEFAULT_PRICING,
      },
    });
  } catch (err) {
    console.error('getOneOnOneConfig error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// PUT /api/one-on-one/config (admin)
// Body: { heading?, subheading?, heroVideo?: { videoUrl?, thumbnailUrl?, ctaText? },
//   benefits: [{ icon?, title, description?, order?, isActive? }],
//   journeySteps?: [{ icon?, title, description?, order?, isActive? }],
//   uniquePoints?: [{ icon?, title, description?, order?, isActive? }],
//   experienceVideos?: [{ videoUrl, thumbnailUrl?, duration?, title, order?, isActive? }],
//   trustBadges?: [{ icon?, label, order?, isActive? }],
//   highlightBanner?: { heading?, subheading?, items?: [{ icon?, label, order?, isActive? }] },
//   pricing?: { heading?, description?, originalPrice?, discountedPrice?, priceNote?, ctaText? },
//   isActive? }
const upsertOneOnOneConfig = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    const updatedBy = req.user?.userId || null;
    if (!organizationId) return res.status(400).json({ message: 'User organization not found' });

    const {
      heading, subheading, heroVideo,
      benefits, journeySteps, uniquePoints, experienceVideos, trustBadges,
      highlightBanner, pricing, isActive,
    } = req.body || {};

    if (!Array.isArray(benefits)) {
      return res.status(400).json({ message: 'benefits must be an array' });
    }
    if (journeySteps !== undefined && !Array.isArray(journeySteps)) {
      return res.status(400).json({ message: 'journeySteps must be an array' });
    }
    if (uniquePoints !== undefined && !Array.isArray(uniquePoints)) {
      return res.status(400).json({ message: 'uniquePoints must be an array' });
    }
    if (experienceVideos !== undefined && !Array.isArray(experienceVideos)) {
      return res.status(400).json({ message: 'experienceVideos must be an array' });
    }
    if (trustBadges !== undefined && !Array.isArray(trustBadges)) {
      return res.status(400).json({ message: 'trustBadges must be an array' });
    }

    const normalizedBenefits = benefits
      .map((b, index) => withOrderAndActive(b, index, {
        icon: String(b?.icon || '').trim(),
        title: String(b?.title || '').trim(),
        description: String(b?.description || '').trim(),
      }))
      .filter((b) => b.title);

    const toSet = {
      organizationId,
      benefits: normalizedBenefits,
      updatedBy,
    };
    if (heading !== undefined) toSet.heading = String(heading || '').trim() || DEFAULTS.heading;
    if (subheading !== undefined) toSet.subheading = String(subheading || '').trim();
    if (heroVideo !== undefined) toSet.heroVideo = normalizeHeroVideo(heroVideo);
    if (isActive !== undefined) toSet.isActive = Boolean(isActive);

    if (journeySteps !== undefined) {
      toSet.journeySteps = journeySteps
        .map((j, index) => withOrderAndActive(j, index, {
          icon: String(j?.icon || '').trim(),
          title: String(j?.title || '').trim(),
          description: String(j?.description || '').trim(),
        }))
        .filter((j) => j.title);
    }

    if (uniquePoints !== undefined) {
      toSet.uniquePoints = uniquePoints
        .map((u, index) => withOrderAndActive(u, index, {
          icon: String(u?.icon || '').trim(),
          title: String(u?.title || '').trim(),
          description: String(u?.description || '').trim(),
        }))
        .filter((u) => u.title);
    }

    if (experienceVideos !== undefined) {
      toSet.experienceVideos = experienceVideos
        .map((v, index) => withOrderAndActive(v, index, {
          videoUrl: String(v?.videoUrl || '').trim(),
          thumbnailUrl: String(v?.thumbnailUrl || '').trim(),
          duration: String(v?.duration || '').trim(),
          title: String(v?.title || '').trim(),
        }))
        .filter((v) => v.videoUrl && v.title);
    }

    if (trustBadges !== undefined) {
      toSet.trustBadges = trustBadges
        .map((t, index) => withOrderAndActive(t, index, {
          icon: String(t?.icon || '').trim(),
          label: String(t?.label || '').trim(),
        }))
        .filter((t) => t.label);
    }

    if (highlightBanner !== undefined) {
      const rawItems = Array.isArray(highlightBanner?.items) ? highlightBanner.items : [];
      toSet.highlightBanner = {
        heading: String(highlightBanner?.heading || '').trim(),
        subheading: String(highlightBanner?.subheading || '').trim(),
        items: rawItems
          .map((item, index) => withOrderAndActive(item, index, {
            icon: String(item?.icon || '').trim(),
            label: String(item?.label || '').trim(),
          }))
          .filter((item) => item.label),
      };
    }

    if (pricing !== undefined) {
      toSet.pricing = normalizePricing(pricing);
    }

    const saved = await OneOnOneConfig.findOneAndUpdate(
      { organizationId },
      { $set: toSet },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    ).lean();

    return res.json({
      success: true,
      data: {
        heading: saved.heading,
        subheading: saved.subheading,
        heroVideo: saved.heroVideo ? normalizeHeroVideo(saved.heroVideo) : DEFAULT_HERO_VIDEO,
        benefits: mapAndSort(saved.benefits, mapBenefit),
        journeySteps: mapAndSort(saved.journeySteps, mapJourneyStep),
        uniquePoints: mapAndSort(saved.uniquePoints, mapUniquePoint),
        highlightBanner: saved.highlightBanner
          ? {
            heading: saved.highlightBanner.heading || '',
            subheading: saved.highlightBanner.subheading || '',
            items: mapAndSort(saved.highlightBanner.items, mapHighlightBannerItem),
          }
          : DEFAULT_HIGHLIGHT_BANNER,
        experienceVideos: mapAndSort(saved.experienceVideos, mapExperienceVideo),
        trustBadges: mapAndSort(saved.trustBadges, mapTrustBadge),
        pricing: saved.pricing ? normalizePricing(saved.pricing) : DEFAULT_PRICING,
        isActive: saved.isActive,
      },
    });
  } catch (err) {
    console.error('upsertOneOnOneConfig error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  getOneOnOneConfig,
  upsertOneOnOneConfig,
};
