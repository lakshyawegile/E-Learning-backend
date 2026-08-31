const { Testimonial } = require('../models');
const paginate = require('../utils/pagination');
const { deleteMediaIfOwned } = require('../utils/mediaCleanup');

const hasAnyContent = ({ imageUrl, videoUrl, title, description }) =>
  Boolean(
    String(imageUrl || '').trim() ||
      String(videoUrl || '').trim() ||
      String(title || '').trim() ||
      String(description || '').trim()
  );

// POST /api/testimonials
const createTestimonial = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    const createdBy = req.user?.userId || null;
    if (!organizationId) return res.status(400).json({ message: 'User organization not found' });

    const { imageUrl, videoUrl, title, description, isActive } = req.body || {};
    if (!hasAnyContent({ imageUrl, videoUrl, title, description })) {
      return res.status(400).json({ message: 'At least one field is required: imageUrl, videoUrl, title, description' });
    }

    const doc = await Testimonial.create({
      organizationId,
      imageUrl: imageUrl !== undefined ? String(imageUrl).trim() : '',
      videoUrl: videoUrl !== undefined ? String(videoUrl).trim() : '',
      title: title !== undefined ? String(title).trim() : '',
      description: description !== undefined ? String(description).trim() : '',
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      createdBy,
    });

    return res.status(201).json(doc);
  } catch (err) {
    console.error('createTestimonial error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/testimonials
const listTestimonials = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(400).json({ message: 'User organization not found' });

    const { page, limit, includeInactive } = req.query;
    const filter = { organizationId };
    if (!includeInactive || includeInactive === 'false') {
      filter.isActive = true;
    }

    const result = await paginate(Testimonial, {
      filter,
      page,
      limit,
      sort: { createdAt: -1 },
    });
    return res.json(result);
  } catch (err) {
    console.error('listTestimonials error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/testimonials/:testimonialId
const getTestimonialById = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(400).json({ message: 'User organization not found' });

    const { testimonialId } = req.params;
    const doc = await Testimonial.findOne({ _id: testimonialId, organizationId }).lean();
    if (!doc) return res.status(404).json({ message: 'Testimonial not found' });
    if (!doc.isActive && req.query.includeInactive !== 'true') {
      return res.status(404).json({ message: 'Testimonial not found' });
    }
    return res.json(doc);
  } catch (err) {
    console.error('getTestimonialById error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// PUT /api/testimonials/:testimonialId
const updateTestimonial = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(400).json({ message: 'User organization not found' });

    const { testimonialId } = req.params;
    const { imageUrl, videoUrl, title, description, isActive } = req.body || {};

    const updates = {};
    if (imageUrl !== undefined) updates.imageUrl = String(imageUrl).trim();
    if (videoUrl !== undefined) updates.videoUrl = String(videoUrl).trim();
    if (title !== undefined) updates.title = String(title).trim();
    if (description !== undefined) updates.description = String(description).trim();
    if (isActive !== undefined) updates.isActive = Boolean(isActive);

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No fields provided for update' });
    }

    const existing = await Testimonial.findOne({ _id: testimonialId, organizationId }).lean();
    if (!existing) return res.status(404).json({ message: 'Testimonial not found' });

    const merged = { ...existing, ...updates };
    if (!hasAnyContent(merged)) {
      return res.status(400).json({ message: 'At least one field is required: imageUrl, videoUrl, title, description' });
    }

    const doc = await Testimonial.findOneAndUpdate(
      { _id: testimonialId, organizationId },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (imageUrl !== undefined && existing.imageUrl && existing.imageUrl !== updates.imageUrl) {
      deleteMediaIfOwned(existing.imageUrl);
    }

    return res.json(doc);
  } catch (err) {
    console.error('updateTestimonial error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// DELETE /api/testimonials/:testimonialId
const deleteTestimonial = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(400).json({ message: 'User organization not found' });

    const { testimonialId } = req.params;
    const deleted = await Testimonial.findOneAndDelete({ _id: testimonialId, organizationId });
    if (!deleted) return res.status(404).json({ message: 'Testimonial not found' });

    if (deleted.imageUrl) {
      deleteMediaIfOwned(deleted.imageUrl);
    }

    return res.json({ message: 'Testimonial deleted' });
  } catch (err) {
    console.error('deleteTestimonial error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  createTestimonial,
  listTestimonials,
  getTestimonialById,
  updateTestimonial,
  deleteTestimonial,
};

