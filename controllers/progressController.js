const { Progress } = require('../models');
const logger = require('../utils/logger');

// POST /api/progress
const upsertProgress = async (req, res) => {
  try {
    const { userId, courseId, completedLessons = [], completionPercentage = 0 } = req.body;

    if (!userId || !courseId) {
      return res.status(400).json({ message: 'userId and courseId are required' });
    }

    const percentage = Math.min(100, Math.max(0, Number(completionPercentage) || 0));
    const lessonIds = Array.isArray(completedLessons) ? completedLessons : [];

    const progress = await Progress.findOneAndUpdate(
      { userId, courseId },
      { completedLessons: lessonIds, completionPercentage: percentage },
      { new: true, upsert: true, runValidators: true }
    ).lean();

    return res.json(progress);
  } catch (err) {
    logger.error('upsertProgress error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = { upsertProgress };
