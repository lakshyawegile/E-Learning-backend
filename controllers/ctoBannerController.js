const { CtoBanner } = require('../models');
const paginate = require('../utils/pagination');

// POST /api/cto-banners
const createCtoBanner = async (req, res) => {
  try {
    const { organizationId, title, type, description, ctaText, ctaUrl, imageUrl, isActive, createdBy } = req.body;
    if (!organizationId || !title || !ctaText || !ctaUrl || !createdBy) {
      return res.status(400).json({ message: 'organizationId, title, ctaText, ctaUrl, and createdBy are required' });
    }

    const banner = await CtoBanner.create({
      organizationId,
      title,
      type: type || 'CAROUSEL',
      description,
      ctaText,
      ctaUrl,
      imageUrl,
      isActive: isActive !== undefined ? isActive : true,
      createdBy,
    });

    return res.status(201).json(banner);
  } catch (err) {
    console.error('createCtoBanner error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/cto-banners
const listCtoBanners = async (req, res) => {
  try {
    const { page, limit, includeInactive } = req.query;
    const filter = {};
    if (!includeInactive || includeInactive === 'false') {
      filter.isActive = true;
    }

    const result = await paginate(CtoBanner, {
      filter,
      page,
      limit,
      sort: { createdAt: -1 },
    });
    return res.json(result);
  } catch (err) {
    console.error('listCtoBanners error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// DELETE /api/cto-banners/:bannerId
const deleteCtoBanner = async (req, res) => {
  try {
    const { bannerId } = req.params;
    const deleted = await CtoBanner.findByIdAndDelete(bannerId);
    if (!deleted) {
      return res.status(404).json({ message: 'Banner not found' });
    }
    return res.json({ message: 'Banner deleted' });
  } catch (err) {
    console.error('deleteCtoBanner error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  createCtoBanner,
  listCtoBanners,
  deleteCtoBanner,
};

