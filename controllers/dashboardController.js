const { CtoBanner, Course, Enrollment, Progress, FreeVideo, ShortVideo, DashboardConfig } = require('../models');
const { defaultSections, defaultAddons } = require('./dashboardConfigController');
const logger = require('../utils/logger');

const requireOrg = (req, res) => {
  const organizationId = req.user?.organizationId;
  if (!organizationId) {
    res.status(400).json({ message: 'User organization not found' });
    return null;
  }
  return organizationId;
};

// GET /api/dashboard/banners
const getDashboardBanners = async (req, res) => {
  try {
    const organizationId = requireOrg(req, res);
    if (!organizationId) return;

    const banners = await CtoBanner.find({
      organizationId,
      isActive: true,
      type: { $in: ['CAROUSEL', 'INLINE'] },
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      carousel: banners.filter((b) => b.type === 'CAROUSEL'),
      inline: banners.filter((b) => b.type === 'INLINE'),
    });
  } catch (err) {
    logger.error('getDashboardBanners error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/dashboard/courses/popular
const getPopularCourses = async (req, res) => {
  try {
    const organizationId = requireOrg(req, res);
    if (!organizationId) return;
    const userId = req.user?.userId;
    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 10));

    const courseFilter = { organizationId, isPublished: true };
    const enrolledByUser =
      userId ? await Enrollment.find({ userId, status: 'ACTIVE' }).distinct('courseId') : [];
    const enrolledSet = new Set(enrolledByUser.map((id) => String(id)));

    const popularCourseIds = await Enrollment.aggregate([
      { $match: { status: 'ACTIVE' } },
      {
        $lookup: {
          from: 'courses',
          localField: 'courseId',
          foreignField: '_id',
          as: 'course',
        },
      },
      { $unwind: '$course' },
      { $match: { 'course.organizationId': organizationId, 'course.isPublished': true } },
      { $group: { _id: '$courseId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: limit },
      { $project: { _id: 1 } },
    ]).then((ids) => ids.map((x) => x._id));

    const popularIdsExcludingEnrolled = popularCourseIds.filter((id) => !enrolledSet.has(String(id)));

    let popularCourses;
    if (popularIdsExcludingEnrolled.length) {
      popularCourses = await Course.find({ _id: { $in: popularIdsExcludingEnrolled }, ...courseFilter })
        .lean()
        .then((courses) => {
          const byId = new Map(courses.map((c) => [String(c._id), c]));
          return popularIdsExcludingEnrolled.map((id) => byId.get(String(id))).filter(Boolean);
        });
    } else {
      const excludeIds = enrolledByUser.length ? { _id: { $nin: enrolledByUser } } : {};
      popularCourses = await Course.find({ ...courseFilter, ...excludeIds })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
    }

    return res.json({ sectionType: 'popular', data: popularCourses });
  } catch (err) {
    logger.error('getPopularCourses error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/dashboard/courses/recommended
const getRecommendedCourses = async (req, res) => {
  try {
    const organizationId = requireOrg(req, res);
    if (!organizationId) return;
    const userId = req.user?.userId;
    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 10));

    const courseFilter = { organizationId, isPublished: true };
    const continueCourseIds = userId ? await Progress.find({ userId }).distinct('courseId') : [];
    const recommendedFilter = {
      ...courseFilter,
      ...(continueCourseIds.length && userId ? { _id: { $nin: continueCourseIds } } : {}),
    };
    const recommendedCourses = await Course.find(recommendedFilter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({ sectionType: 'recommended', data: recommendedCourses });
  } catch (err) {
    logger.error('getRecommendedCourses error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/dashboard/continue
const getContinueCourses = async (req, res) => {
  try {
    const organizationId = requireOrg(req, res);
    if (!organizationId) return;
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 20));

    const courseFilter = { organizationId, isPublished: true };
    const progressList = await Progress.find({ userId }).sort({ updatedAt: -1 }).limit(limit).lean();
    const courseIds = progressList.map((p) => p.courseId);
    const courses = await Course.find({ _id: { $in: courseIds }, ...courseFilter }).lean();
    const courseMap = new Map(courses.map((c) => [String(c._id), c]));
    const continueCourses = progressList
      .map((p) => {
        const course = courseMap.get(String(p.courseId));
        if (!course) return null;
        return {
          ...course,
          completionPercentage: p.completionPercentage ?? 0,
          progressUpdatedAt: p.updatedAt,
        };
      })
      .filter(Boolean);

    return res.json({ data: continueCourses });
  } catch (err) {
    logger.error('getContinueCourses error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/dashboard/free-videos
const getDashboardFreeVideos = async (req, res) => {
  try {
    const organizationId = requireOrg(req, res);
    if (!organizationId) return;
    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 10));

    const freeVideos = await FreeVideo.find({ organizationId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({ data: freeVideos });
  } catch (err) {
    logger.error('getDashboardFreeVideos error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/dashboard/shorts
const getDashboardShorts = async (req, res) => {
  try {
    const organizationId = requireOrg(req, res);
    if (!organizationId) return;
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));

    const shorts = await ShortVideo.find({ organizationId, isActive: true })
      .sort({ order: 1, createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({ sectionType: 'shorts', data: shorts });
  } catch (err) {
    logger.error('getDashboardShorts error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/dashboard/sections (config only, app-friendly)
const getDashboardSectionsConfig = async (req, res) => {
  try {
    const organizationId = requireOrg(req, res);
    if (!organizationId) return;

    const config = await DashboardConfig.findOne({ organizationId }).lean();
    const sectionsConfig = config?.sections?.length ? config.sections : defaultSections();
    const addonsFromConfig = config?.addons && typeof config.addons === 'object' ? config.addons : defaultAddons();

    const orderedSections = sectionsConfig
      .filter((s) => s.isActive !== false)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    return res.json({ addons: addonsFromConfig, sections: orderedSections });
  } catch (err) {
    logger.error('getDashboardSectionsConfig error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/dashboard
const getDashboard = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;

    if (!organizationId) {
      return res.status(400).json({ message: 'User organization not found' });
    }

    const baseFilter = { organizationId, isActive: true };
    const courseFilter = { organizationId, isPublished: true };

    // 1) Banners: CAROUSEL and INLINE separately (single query, split by type)
    const banners = await CtoBanner.find({ ...baseFilter, type: { $in: ['CAROUSEL', 'INLINE'] } })
      .sort({ createdAt: -1 })
      .lean();
    // logger.info('banners', banners);
    const carouselBanners = banners.filter((b) => b.type === 'CAROUSEL');
    const inlineBanners = banners.filter((b) => b.type === 'INLINE');

    // 2) Most Popular Courses (by active enrollment count, org-scoped; exclude already enrolled)
    const enrolledByUser =
      userId ? await Enrollment.find({ userId, status: 'ACTIVE' }).distinct('courseId') : [];
    const enrolledSet = new Set(enrolledByUser.map((id) => String(id)));

    const popularCourseIds = await Enrollment.aggregate([
      { $match: { status: 'ACTIVE' } },
      {
        $lookup: {
          from: 'courses',
          localField: 'courseId',
          foreignField: '_id',
          as: 'course',
        },
      },
      { $unwind: '$course' },
      { $match: { 'course.organizationId': organizationId, 'course.isPublished': true } },
      { $group: { _id: '$courseId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      { $project: { _id: 1 } },
    ]).then((ids) => ids.map((x) => x._id));

    const popularIdsExcludingEnrolled = popularCourseIds.filter((id) => !enrolledSet.has(String(id)));

    let popularCourses;
    if (popularIdsExcludingEnrolled.length) {
      popularCourses = await Course.find({
        _id: { $in: popularIdsExcludingEnrolled },
        ...courseFilter,
      })
        .lean()
        .then((courses) => {
          const byId = new Map(courses.map((c) => [String(c._id), c]));
          return popularIdsExcludingEnrolled
            .map((id) => byId.get(String(id)))
            .filter(Boolean);
        });
    } else {
      // Fallback: no popular left after excluding enrolled — show published courses not enrolled, latest first
      const excludeIds = enrolledByUser.length ? { _id: { $nin: enrolledByUser } } : {};
      popularCourses = await Course.find({ ...courseFilter, ...excludeIds })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();
    }

    // 3) Recommended Courses (published, not in "continue", limit)
    const continueCourseIds = userId
      ? await Progress.find({ userId }).distinct('courseId')
      : [];
    const recommendedFilter = {
      ...courseFilter,
      ...(continueCourseIds.length && userId
        ? { _id: { $nin: continueCourseIds } }
        : {}),
    };
    const recommendedCourses = await Course.find(recommendedFilter)
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // 4) Start from where you left (with progress bar)
    let continueCourses = [];
    if (userId) {
      const progressList = await Progress.find({ userId })
        .sort({ updatedAt: -1 })
        .lean();
      const courseIds = progressList.map((p) => p.courseId);
      const courses = await Course.find({
        _id: { $in: courseIds },
        ...courseFilter,
      }).lean();
      const courseMap = new Map(courses.map((c) => [String(c._id), c]));
      continueCourses = progressList
        .map((p) => {
          const course = courseMap.get(String(p.courseId));
          if (!course) return null;
          return {
            ...course,
            completionPercentage: p.completionPercentage ?? 0,
            progressUpdatedAt: p.updatedAt,
          };
        })
        .filter(Boolean);
    }

    // 5 Free videos
    const freeVideos = await FreeVideo.find({ organizationId })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // 6 Shorts (reel-style short videos)
    const shorts = await ShortVideo.find({ organizationId, isActive: true })
      .sort({ order: 1, createdAt: -1 })
      .limit(20)
      .lean();

    const courseDataSources = [popularCourses, recommendedCourses];

    let config = await DashboardConfig.findOne({ organizationId }).lean();
    const sectionsConfig = config?.sections?.length ? config.sections : defaultSections();
    const addonsFromConfig = config?.addons && typeof config.addons === 'object' ? config.addons : defaultAddons();

    const orderedSections = sectionsConfig
      .filter((s) => s.isActive !== false)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    let courseSectionIndex = 0;
    const getDataForSection = (s) => {
      if (s.key === 'course') {
        // Use sectionType from config if set; else fallback by order (first=popular, second=recommended)
        const sectionType = s.sectionType === 'popular' || s.sectionType === 'recommended'
          ? s.sectionType
          : (courseSectionIndex === 0 ? 'popular' : 'recommended');
        const data = sectionType === 'popular' ? (courseDataSources[0] ?? []) : (courseDataSources[1] ?? []);
        courseSectionIndex += 1;
        return { data, sectionType };
      }
      if (s.key === 'continue') return { data: continueCourses };
      if (s.key === 'freeVideos') return { data: freeVideos };
      if (s.key === 'shorts') return { data: shorts, sectionType: 'shorts' };
      if (s.key === 'banner') return { data: [] };
      return { data: [] };
    };

    let sections = orderedSections.map((s) => {
      const result = getDataForSection(s);
      return {
        key: s.key,
        title: s.title,
        subtitle: s.subtitle ?? '',
        order: s.order,
        ...(result.sectionType != null && { sectionType: result.sectionType }),
        data: result.data,
      };
    });

    // Insert one random inline banner between 2nd and 3rd course section
    const courseIndices = sections.map((s, i) => (s.key === 'course' ? i : null)).filter((i) => i != null);
    if (courseIndices.length >= 2 && inlineBanners.length > 0) {
      const insertAfter = courseIndices[Math.random() < 0.5 ? 1 : Math.min(2, courseIndices.length - 1)];
      const randomBanner = inlineBanners[Math.floor(Math.random() * inlineBanners.length)];
      const bannerBlock = {
        key: 'banner',
        title: 'Banner',
        subtitle: '',
        order: 0,
        data: [randomBanner],
      };
      sections = [...sections.slice(0, insertAfter + 1), bannerBlock, ...sections.slice(insertAfter + 1)];
    }

    // Ensure unique order: 1, 2, 3, ...
    sections = sections.map((s, i) => ({ ...s, order: i + 1 }));

    const popupBanner = addonsFromConfig.popup || {
      title: 'Welcome to the dashboard',
      description: 'This is a popup banner',
      imageUrl: 'https://i.ytimg.com/vi/qOFIvVZBw38/hqdefault.jpg?sqp=-oaymwEnCNACELwBSFryq4qpAxkIARUAAIhCGAHYAQHiAQoIGBACGAY4AUAB&rs=AOn4CLA5tZjoPOcNq7-QiPkqWqNFfEf3BA',
      link: 'https://www.google.com',
    };

    return res.json({
      addons: {
        ...addonsFromConfig,
        carousel: carouselBanners,
        popup: popupBanner,
      },
      sections,
    });
  } catch (err) {
    logger.error('getDashboard error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  getDashboard,
  getDashboardBanners,
  getPopularCourses,
  getRecommendedCourses,
  getContinueCourses,
  getDashboardFreeVideos,
  getDashboardShorts,
  getDashboardSectionsConfig,
};
