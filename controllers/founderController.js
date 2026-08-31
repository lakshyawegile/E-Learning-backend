const { FounderInfo } = require('../models');
const { deleteMediaIfOwned } = require('../utils/mediaCleanup');

// GET /api/founder (org-wise; requires JWT since org comes from token)
const getFounderInfo = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(400).json({ message: 'User organization not found' });

    const founder = await FounderInfo.findOne({ organizationId, isActive: true }).lean();
    return res.json({
      success: true,
      data: founder
        ? {
            name: founder.name,
            designation: founder.designation,
            imageUrl: founder.imageUrl,
            message: founder.message,
            videoUrl: founder.videoUrl,
          }
        : {
            name: '',
            designation: '',
            imageUrl: '',
            message: '',
            videoUrl: '',
          },
    });
  } catch (err) {
    console.error('getFounderInfo error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// PUT /api/founder (admin)
const upsertFounderInfo = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(400).json({ message: 'User organization not found' });

    const { name, designation, imageUrl, message, videoUrl, isActive } = req.body || {};
    const toSet = {};
    if (name !== undefined) toSet.name = String(name).trim();
    if (designation !== undefined) toSet.designation = String(designation).trim();
    if (imageUrl !== undefined) toSet.imageUrl = String(imageUrl).trim();
    if (message !== undefined) toSet.message = String(message).trim();
    if (videoUrl !== undefined) toSet.videoUrl = String(videoUrl).trim();
    if (isActive !== undefined) toSet.isActive = Boolean(isActive);

    const previous = imageUrl !== undefined
      ? await FounderInfo.findOne({ organizationId }).select('imageUrl').lean()
      : null;

    const saved = await FounderInfo.findOneAndUpdate(
      { organizationId },
      { $set: { organizationId, ...toSet } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    if (previous && previous.imageUrl && previous.imageUrl !== toSet.imageUrl) {
      deleteMediaIfOwned(previous.imageUrl);
    }

    return res.json({
      success: true,
      data: {
        name: saved.name,
        designation: saved.designation,
        imageUrl: saved.imageUrl,
        message: saved.message,
        videoUrl: saved.videoUrl,
        isActive: saved.isActive,
      },
    });
  } catch (err) {
    console.error('upsertFounderInfo error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = { getFounderInfo, upsertFounderInfo };

