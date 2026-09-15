const { ShortVideo } = require('../models');
const paginate = require('../utils/pagination');
const logger = require('../utils/logger');

// POST /api/short-videos
const createShortVideo = async (req, res) => {
  try {
    const { organizationId, title, description, videoUrl, thumbnailUrl, durationSeconds, order, isActive } = req.body;
    const createdBy = req.user?.userId;

    if (!organizationId || !title || !videoUrl) {
      return res.status(400).json({ message: 'organizationId, title, and videoUrl are required' });
    }
    if (!createdBy) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const video = await ShortVideo.create({
      organizationId,
      title,
      description: description ?? '',
      videoUrl,
      thumbnailUrl: thumbnailUrl ?? '',
      durationSeconds: durationSeconds ?? null,
      order: order ?? 0,
      isActive: isActive !== false,
      createdBy,
    });

    return res.status(201).json(video);
  } catch (err) {
    logger.error('createShortVideo error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/short-videos
const listShortVideos = async (req, res) => {
  try {
    const { page, limit, organizationId: queryOrgId, includeInactive } = req.query;
    const userOrgId = req.user?.organizationId;

    const filter = {};
    if (queryOrgId) {
      filter.organizationId = queryOrgId;
    } else if (userOrgId) {
      filter.organizationId = userOrgId;
    }
    if (!includeInactive || includeInactive === 'false') {
      filter.isActive = true;
    }

    const result = await paginate(ShortVideo, {
      filter,
      page,
      limit,
      sort: { order: 1, createdAt: -1 },
    });

    return res.json(result);
  } catch (err) {
    logger.error('listShortVideos error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/short-videos/:videoId
const getShortVideoById = async (req, res) => {
  try {
    const { videoId } = req.params;
    const userOrgId = req.user?.organizationId;

    const video = await ShortVideo.findById(videoId).lean();
    if (!video) {
      return res.status(404).json({ message: 'Short video not found' });
    }
    if (!video.isActive) {
      return res.status(404).json({ message: 'Short video not found' });
    }
    if (userOrgId && String(video.organizationId) !== String(userOrgId)) {
      return res.status(404).json({ message: 'Short video not found' });
    }

    return res.json(video);
  } catch (err) {
    logger.error('getShortVideoById error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// PATCH /api/short-videos/:videoId
const updateShortVideo = async (req, res) => {
  try {
    const { videoId } = req.params;
    const { title, description, videoUrl, thumbnailUrl, durationSeconds, order, isActive } = req.body;

    const update = {};
    if (title !== undefined) update.title = title;
    if (description !== undefined) update.description = description;
    if (videoUrl !== undefined) update.videoUrl = videoUrl;
    if (thumbnailUrl !== undefined) update.thumbnailUrl = thumbnailUrl;
    if (durationSeconds !== undefined) update.durationSeconds = durationSeconds;
    if (order !== undefined) update.order = Number(order);
    if (isActive !== undefined) update.isActive = isActive;

    const video = await ShortVideo.findByIdAndUpdate(videoId, { $set: update }, { new: true });
    if (!video) {
      return res.status(404).json({ message: 'Short video not found' });
    }

    return res.json(video);
  } catch (err) {
    logger.error('updateShortVideo error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// DELETE /api/short-videos/:videoId
const deleteShortVideo = async (req, res) => {
  try {
    const { videoId } = req.params;
    const video = await ShortVideo.findByIdAndDelete(videoId);
    if (!video) {
      return res.status(404).json({ message: 'Short video not found' });
    }
    return res.json({ message: 'Short video deleted' });
  } catch (err) {
    logger.error('deleteShortVideo error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  createShortVideo,
  listShortVideos,
  getShortVideoById,
  updateShortVideo,
  deleteShortVideo,
};
