const { Lesson, Course, Chapter } = require('../models');
const paginate = require('../utils/pagination');
const logger = require('../utils/logger');

// When adding a lesson without chapterId, create a new default chapter for the course
const createDefaultChapter = async (courseId) => {
  const last = await Chapter.findOne({ courseId }).sort({ order: -1 });
  const nextOrder = last ? last.order + 1 : 1;
  const title = `Chapter ${nextOrder}`;
  const newChapter = await Chapter.create({ courseId, title, order: nextOrder });
  return newChapter;
};

// POST /api/courses/:courseId/lessons
const createLesson = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { chapterId, title, type, contentUrl, order } = req.body;

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    if (!title || !type || !contentUrl || order == null) {
      return res.status(400).json({
        message: 'title, type, contentUrl, and order are required',
      });
    }
    if (!['VIDEO', 'PDF'].includes(type)) {
      return res.status(400).json({ message: 'type must be VIDEO or PDF' });
    }

    let targetChapterId = chapterId;
    if (!targetChapterId) {
      const defaultChapter = await createDefaultChapter(courseId);
      targetChapterId = defaultChapter._id;
    } else {
      const chapter = await Chapter.findOne({ _id: chapterId, courseId });
      if (!chapter) {
        return res.status(404).json({ message: 'Chapter not found or does not belong to this course' });
      }
    }

    const lesson = await Lesson.create({
      courseId,
      chapterId: targetChapterId,
      title: title.trim(),
      type,
      contentUrl: contentUrl.trim(),
      order: Number(order),
    });
    const populated = await Lesson.findById(lesson._id).populate('chapterId', 'title order').lean();
    return res.status(201).json(populated);
  } catch (err) {
    logger.error('createLesson error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/courses/:courseId/lessons
const listLessonsByCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { page, limit } = req.query;

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const sort = { order: 1 };
    const filter = { courseId };
    let data = await Lesson.find(filter).populate('chapterId', 'title order').sort({ 'chapterId.order': 1, order: 1 }).lean();
    data = data.sort((a, b) => {
      const o1 = (a.chapterId && a.chapterId.order) != null ? a.chapterId.order : 0;
      const o2 = (b.chapterId && b.chapterId.order) != null ? b.chapterId.order : 0;
      if (o1 !== o2) return o1 - o2;
      return (a.order ?? 0) - (b.order ?? 0);
    });

    if (!page && !limit) {
      return res.json({ data, meta: { page: 1, limit: data.length, total: data.length, totalPages: 1 } });
    }

    const total = data.length;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
    const skip = (pageNum - 1) * limitNum;
    const paginatedData = data.slice(skip, skip + limitNum);
    const totalPages = Math.max(1, Math.ceil(total / limitNum));
    return res.json({
      data: paginatedData,
      meta: { page: pageNum, limit: limitNum, total, totalPages },
    });
  } catch (err) {
    logger.error('listLessonsByCourse error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/courses/:courseId/lessons/:lessonId
const getLessonById = async (req, res) => {
  try {
    const { courseId, lessonId } = req.params;
    const lesson = await Lesson.findOne({ _id: lessonId, courseId }).populate('chapterId', 'title order').lean();
    if (!lesson) {
      return res.status(404).json({ message: 'Lesson not found' });
    }
    return res.json(lesson);
  } catch (err) {
    logger.error('getLessonById error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// PUT /api/courses/:courseId/lessons/:lessonId
const updateLesson = async (req, res) => {
  try {
    const { courseId, lessonId } = req.params;
    const allowed = ['chapterId', 'title', 'type', 'contentUrl', 'order'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (updates.type && !['VIDEO', 'PDF'].includes(updates.type)) {
      return res.status(400).json({ message: 'type must be VIDEO or PDF' });
    }
    if (updates.chapterId) {
      const chapter = await Chapter.findOne({ _id: updates.chapterId, courseId });
      if (!chapter) return res.status(400).json({ message: 'Chapter not found or does not belong to this course' });
    }
    if (updates.title != null) updates.title = String(updates.title).trim();
    if (updates.contentUrl != null) updates.contentUrl = String(updates.contentUrl).trim();
    if (updates.order != null) updates.order = Number(updates.order);

    const lesson = await Lesson.findOneAndUpdate(
      { _id: lessonId, courseId },
      updates,
      { new: true, runValidators: true }
    ).populate('chapterId', 'title order');
    if (!lesson) {
      return res.status(404).json({ message: 'Lesson not found' });
    }
    return res.json(lesson);
  } catch (err) {
    logger.error('updateLesson error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// DELETE /api/courses/:courseId/lessons/:lessonId
const deleteLesson = async (req, res) => {
  try {
    const { courseId, lessonId } = req.params;
    const deleted = await Lesson.findOneAndDelete({ _id: lessonId, courseId });
    if (!deleted) {
      return res.status(404).json({ message: 'Lesson not found' });
    }
    return res.json({ message: 'Lesson deleted' });
  } catch (err) {
    logger.error('deleteLesson error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  createLesson,
  listLessonsByCourse,
  getLessonById,
  updateLesson,
  deleteLesson,
};
