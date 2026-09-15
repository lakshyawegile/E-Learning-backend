const { Chapter, Course, Lesson } = require('../models');
const logger = require('../utils/logger');

// GET /api/courses/:courseId/chapters
const listChaptersByCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: 'Course not found' });
    const chapters = await Chapter.find({ courseId }).sort({ order: 1 }).lean();
    return res.json(chapters);
  } catch (err) {
    logger.error('listChaptersByCourse error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// POST /api/courses/:courseId/chapters
const createChapter = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { title, order } = req.body;
    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: 'Course not found' });
    const last = await Chapter.findOne({ courseId }).sort({ order: -1 });
    const nextOrder = order != null ? Number(order) : (last ? last.order + 1 : 1);
    const chapter = await Chapter.create({
      courseId,
      title: (title && String(title).trim()) || `Chapter ${nextOrder}`,
      order: nextOrder,
    });
    return res.status(201).json(chapter);
  } catch (err) {
    logger.error('createChapter error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// PUT /api/courses/:courseId/chapters/:chapterId
const updateChapter = async (req, res) => {
  try {
    const { courseId, chapterId } = req.params;
    const { title, order } = req.body;
    const updates = {};
    if (title !== undefined) updates.title = String(title).trim();
    if (order !== undefined) updates.order = Number(order);
    const chapter = await Chapter.findOneAndUpdate(
      { _id: chapterId, courseId },
      updates,
      { new: true }
    );
    if (!chapter) return res.status(404).json({ message: 'Chapter not found' });
    return res.json(chapter);
  } catch (err) {
    logger.error('updateChapter error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// DELETE /api/courses/:courseId/chapters/:chapterId
const deleteChapter = async (req, res) => {
  try {
    const { courseId, chapterId } = req.params;
    const chapter = await Chapter.findOne({ _id: chapterId, courseId });
    if (!chapter) return res.status(404).json({ message: 'Chapter not found' });
    await Lesson.deleteMany({ chapterId });
    await Chapter.findByIdAndDelete(chapterId);
    return res.json({ message: 'Chapter and its lessons deleted' });
  } catch (err) {
    logger.error('deleteChapter error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  listChaptersByCourse,
  createChapter,
  updateChapter,
  deleteChapter,
};
