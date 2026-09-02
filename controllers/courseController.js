const { Course, Lesson, Enrollment, Progress } = require('../models');
const paginate = require('../utils/pagination');
const { deleteMediaIfOwned } = require('../utils/mediaCleanup');

// GET /api/courses
const getCourses = async (req, res) => {
  try {
    const { page, limit } = req.query;
    const result = await paginate(Course, {
      page,
      limit,
      sort: { createdAt: -1 },
      projection: {
        title: 1,
        description: 1,
        basePrice: 1,
        isPublished: 1,
        organizationId: 1,
        createdBy: 1,
        createdAt: 1,
        updatedAt: 1,
        imageUrl: 1,
      },
    });
    return res.json(result);
  } catch (err) {
    console.error('getCourses error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/courses/:courseId
const getCourseById = async (req, res) => {
  try {
    const { courseId } = req.params;
    const course = await Course.findById(courseId).lean();
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    let lessons = await Lesson.find({ courseId }).populate('chapterId', 'title order').lean();
    lessons = lessons.sort((a, b) => {
      const o1 = (a.chapterId && a.chapterId.order) != null ? a.chapterId.order : 0;
      const o2 = (b.chapterId && b.chapterId.order) != null ? b.chapterId.order : 0;
      if (o1 !== o2) return o1 - o2;
      return (a.order ?? 0) - (b.order ?? 0);
    });

    return res.json({ ...course, lessons });
  } catch (err) {
    console.error('getCourseById error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/courses/my
const getMyEnrolledCourses = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { page, limit } = req.query;
    const filter = { userId, status: 'ACTIVE' };
    const result = await paginate(Enrollment, {
      filter,
      page,
      limit,
      sort: { createdAt: -1 },
      populate: [{ path: 'courseId', select: 'title description basePrice imageUrl organizationId isPublished' }],
    });

    if (!result.data?.length) {
      return res.json(result);
    }

    const courseIds = result.data.map((e) => e.courseId?._id).filter(Boolean);
    const progressList = await Progress.find(
      { userId, courseId: { $in: courseIds } },
      { courseId: 1, completionPercentage: 1 }
    ).lean();
    const progressMap = new Map(progressList.map((p) => [String(p.courseId), p.completionPercentage ?? 0]));

    const data = result.data.map((e) => {
      const course = e.courseId;
      if (!course) return null;
      const c = typeof course.toObject === 'function' ? course.toObject() : course;
      return {
        ...c,
        enrolledAt: e.createdAt,
        finalPricePaid: e.finalPricePaid,
        status: e.status,
        completionPercentage: progressMap.get(String(c._id)) ?? 0,
      };
    }).filter(Boolean);

    return res.json({ ...result, data });
  } catch (err) {
    console.error('getMyEnrolledCourses error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// PUT /api/courses/:courseId
const updateCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { title, description, imageUrl, basePrice, isPublished } = req.body || {};

    const updates = {};
    if (title !== undefined) updates.title = String(title).trim();
    if (description !== undefined) updates.description = String(description).trim();
    if (imageUrl !== undefined) updates.imageUrl = String(imageUrl).trim();
    if (basePrice !== undefined) updates.basePrice = Number(basePrice);
    if (isPublished !== undefined) updates.isPublished = Boolean(isPublished);

    const previous = imageUrl !== undefined
      ? await Course.findById(courseId).select('imageUrl').lean()
      : null;

    const course = await Course.findByIdAndUpdate(
      courseId,
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    if (previous && previous.imageUrl && previous.imageUrl !== updates.imageUrl) {
      deleteMediaIfOwned(previous.imageUrl);
    }

    return res.json(course);
  } catch (err) {
    console.error('updateCourse error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = { getCourses, getCourseById, getMyEnrolledCourses, updateCourse };

