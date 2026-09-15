const { DashboardConfig, CtoBanner } = require('../models');
const logger = require('../utils/logger');

const defaultSections = () => [
  { key: 'course', title: 'Most Popular Courses', subtitle: 'Discover our most popular courses', order: 1, isActive: true, sectionType: 'popular' },
  { key: 'course', title: 'Recommended Courses', subtitle: 'Discover our recommended courses', order: 2, isActive: true, sectionType: 'recommended' },
  { key: 'banner', title: 'Banner', subtitle: '', order: 3, isActive: true },
  { key: 'continue', title: 'Continue Courses', subtitle: 'Continue your learning', order: 4, isActive: true },
  { key: 'freeVideos', title: 'Free Videos', subtitle: 'Discover our free videos', order: 5, isActive: true },
  { key: 'shorts', title: 'Shorts', subtitle: 'Short videos & reels', order: 6, isActive: true },
];

const defaultAddons = () => ({
  language: 'english,hindi,bhojpuri,telugu,kannada,malayalam,punjabi,urdu,sindhi,gujarati,odia,tamil,bengali,marathi',
  darkMode: true,
  theme: 'light,dark',
  font: 'Roboto,Arial,Helvetica,sans-serif',
  fontSize: '14px',
  fontWeight: '400',
  fontColor: '#000000',
  backgroundColor: '#ffffff',
  borderRadius: '10px',
  primaryColor: '#000000',
  secondaryColor: '#ffffff',
});

// GET /api/dashboard/config
const getConfig = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId || req.query.organizationId;
    if (!organizationId) return res.status(400).json({ message: 'organizationId required' });

    let config = await DashboardConfig.findOne({ organizationId }).lean();
    if (!config) {
      config = {
        organizationId,
        sections: defaultSections(),
        addons: defaultAddons(),
      };
    }
    const inlineBanners = await CtoBanner.find({ organizationId, type: 'INLINE', isActive: true })
      .select('_id title ctaText ctaUrl imageUrl type')
      .lean();
    return res.json({ ...config, inlineBanners });
  } catch (err) {
    logger.error('getConfig error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// PUT /api/dashboard/config
const updateConfig = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId || req.body.organizationId;
    if (!organizationId) return res.status(400).json({ message: 'organizationId required' });

    const { sections, addons } = req.body;
    const update = {};
    if (Array.isArray(sections)) {
      update.sections = sections.map((s) => ({
        key: s.key,
        title: s.title || s.key,
        subtitle: s.subtitle != null ? s.subtitle : '',
        order: typeof s.order === 'number' ? s.order : 0,
        isActive: s.isActive !== false,
        sectionType: s.key === 'course' && (s.sectionType === 'popular' || s.sectionType === 'recommended') ? s.sectionType : null,
      }));
    }
    if (addons && typeof addons === 'object') update.addons = addons;

    const config = await DashboardConfig.findOneAndUpdate(
      { organizationId },
      { $set: update },
      { new: true, upsert: true }
    ).lean();
    return res.json(config);
  } catch (err) {
    logger.error('updateConfig error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = { getConfig, updateConfig, defaultSections, defaultAddons };
