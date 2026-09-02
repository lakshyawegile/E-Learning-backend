const { FreeVideo } = require('../models');
const paginate = require('../utils/pagination');
const { deleteMediaIfOwned } = require('../utils/mediaCleanup');

// POST /api/free-videos
const createFreeVideo = async (req, res) => {
  try {
    const { organizationId, title, description, videoUrl, thumbnailUrl, durationSeconds, tags, isPublished, createdBy } =
      req.body;

    if (!organizationId || !title || !videoUrl || !createdBy) {
      return res.status(400).json({ message: 'organizationId, title, videoUrl, and createdBy are required' });
    }

    const video = await FreeVideo.create({
      organizationId,
      title,
      description,
      videoUrl,
      thumbnailUrl,
      durationSeconds,
      tags,
      isPublished: isPublished !== undefined ? isPublished : false,
      createdBy,
    });

    return res.status(201).json(video);
  } catch (err) {
    console.error('createFreeVideo error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/free-videos
const listFreeVideos = async (req, res) => {
  try {
    const { page, limit, includeUnpublished } = req.query;
    const filter = {};
    if (!includeUnpublished || includeUnpublished === 'false') {
      filter.isPublished = true;
    }
    const result = await paginate(FreeVideo, {
      filter,
      page,
      limit,
      sort: { createdAt: -1 },
      projection: {
        title: 1,
        description: 1,
        videoUrl: 1,
        thumbnailUrl: 1,
        durationSeconds: 1,
        tags: 1,
        isPublished: 1,
        organizationId: 1,
        createdBy: 1,
        createdAt: 1,
      },
    });
    return res.json(result);
  } catch (err) {
    console.error('listFreeVideos error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/free-videos/:videoId
const getFreeVideoById = async (req, res) => {
  try {
    const { videoId } = req.params;
    const video = await FreeVideo.findById(videoId).lean();
    if (!video) {
      return res.status(404).json({ message: 'Free video not found' });
    }
    if (!video.isPublished && req.query.includeUnpublished !== 'true') {
      return res.status(404).json({ message: 'Free video not found' });
    }
    return res.json(video);
  } catch (err) {
    console.error('getFreeVideoById error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// PUT /api/free-videos/:videoId
const updateFreeVideo = async (req, res) => {
  try {
    const { videoId } = req.params;
    const { title, description, videoUrl, thumbnailUrl, durationSeconds, tags, isPublished } = req.body || {};

    const updates = {};
    if (title !== undefined) updates.title = String(title).trim();
    if (description !== undefined) updates.description = String(description).trim();
    if (videoUrl !== undefined) updates.videoUrl = String(videoUrl).trim();
    if (thumbnailUrl !== undefined) updates.thumbnailUrl = String(thumbnailUrl).trim();
    if (durationSeconds !== undefined) updates.durationSeconds = Number(durationSeconds);
    if (tags !== undefined) updates.tags = tags;
    if (isPublished !== undefined) updates.isPublished = Boolean(isPublished);

    const previous = thumbnailUrl !== undefined
      ? await FreeVideo.findById(videoId).select('thumbnailUrl').lean()
      : null;

    const video = await FreeVideo.findByIdAndUpdate(
      videoId,
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!video) {
      return res.status(404).json({ message: 'Free video not found' });
    }

    if (previous && previous.thumbnailUrl && previous.thumbnailUrl !== updates.thumbnailUrl) {
      deleteMediaIfOwned(previous.thumbnailUrl);
    }

    return res.json(video);
  } catch (err) {
    console.error('updateFreeVideo error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  createFreeVideo,
  listFreeVideos,
  getFreeVideoById,
  updateFreeVideo,
};

