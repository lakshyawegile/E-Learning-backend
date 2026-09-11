const { User, Enrollment, Progress, QuizAttempt, Course, UserProfileAnswers } = require('../models');
const { distinctUserIdsWithActivePremium } = require('../utils/distinctUserIdsWithActivePremium');
const { buildProfileAnswersMap } = require('../utils/profileAnswerFormat');

// GET /api/user/profile
const getProfile = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const [activeCourses, completedCourses, quizzesTaken] = await Promise.all([
      Enrollment.countDocuments({ userId, status: 'ACTIVE' }),
      Progress.countDocuments({ userId, completionPercentage: 100 }),
      QuizAttempt.countDocuments({ userId }),
    ]);

    const profile = {
      _id: user._id,
      name: user.name,
      mobile: user.mobile,
      role: user.role,
      email: user.email ?? '',
      avatarUrl: user.avatarUrl ?? '',
      interestedIn: user.interestedIn ?? '',
      stats: {
        activeCourses,
        completedCourses,
        quizzesTaken,
      },
    };

    return res.json(profile);
  } catch (err) {
    console.error('getProfile error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// PUT /api/user/profile
const updateProfile = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { name, email, avatarUrl, interestedIn } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = String(name).trim();
    if (email !== undefined) updates.email = String(email).toLowerCase().trim();
    if (avatarUrl !== undefined) updates.avatarUrl = String(avatarUrl).trim();
    if (interestedIn !== undefined) updates.interestedIn = String(interestedIn).toLowerCase().trim();

    const user = await User.findByIdAndUpdate(userId, { $set: updates }, { new: true, runValidators: true }).lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const [activeCourses, completedCourses, quizzesTaken] = await Promise.all([
      Enrollment.countDocuments({ userId, status: 'ACTIVE' }),
      Progress.countDocuments({ userId, completionPercentage: 100 }),
      QuizAttempt.countDocuments({ userId }),
    ]);

    const profile = {
      _id: user._id,
      name: user.name,
      mobile: user.mobile,
      role: user.role,
      email: user.email ?? '',
      avatarUrl: user.avatarUrl ?? '',
      interestedIn: user.interestedIn ?? '',
      stats: { activeCourses, completedCourses, quizzesTaken },
    };

    return res.json(profile);
  } catch (err) {
    console.error('updateProfile error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/user/admin/list – admin: paginated users with courses summary
const listUsersAdmin = async (req, res) => {
  try {
    const requesterRole = req.user?.role;
    const requesterOrgId = req.user?.organizationId;
    if (!requesterRole || (requesterRole !== 'SUPER_ADMIN' && requesterRole !== 'ORG_ADMIN')) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { page = 1, limit = 20, role, search } = req.query;

    const filter = {};
    if (requesterRole === 'ORG_ADMIN' && requesterOrgId) {
      filter.organizationId = requesterOrgId;
    }
    if (role) {
      filter.role = role;
    }
    if (search && typeof search === 'string') {
      const q = search.trim();
      if (q) {
        filter.$or = [
          { name: new RegExp(q, 'i') },
          { email: new RegExp(q, 'i') },
          { mobile: new RegExp(q, 'i') },
        ];
      }
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [users, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      User.countDocuments(filter),
    ]);

    if (!users.length) {
      return res.json({
        data: [],
        meta: { page: pageNum, limit: limitNum, total: 0, totalPages: 1 },
      });
    }

    const userIds = users.map((u) => u._id);
    const now = new Date();
    const [enrollments, premiumUserIds, profileAnswerDocs] = await Promise.all([
      Enrollment.find(
        { userId: { $in: userIds } },
        { userId: 1, courseId: 1, finalPricePaid: 1, status: 1 }
      )
        .populate('courseId', 'title basePrice')
        .lean(),
      distinctUserIdsWithActivePremium(userIds, now),
      UserProfileAnswers.find(
        { userId: { $in: userIds } },
        { userId: 1, answers: 1, completionPercentage: 1, isComplete: 1 }
      ).lean(),
    ]);

    const enrollmentMap = new Map();
    for (const e of enrollments) {
      const key = String(e.userId);
      if (!enrollmentMap.has(key)) enrollmentMap.set(key, []);
      enrollmentMap.get(key).push({
        courseId: e.courseId?._id || e.courseId,
        courseTitle: e.courseId?.title || '',
        basePrice: e.courseId?.basePrice ?? null,
        finalPricePaid: e.finalPricePaid,
        status: e.status,
        enrolledAt: e.createdAt,
      });
    }

    const profileAnswersMap = buildProfileAnswersMap(profileAnswerDocs);

    const data = users.map((u) => ({
      _id: u._id,
      name: u.name,
      email: u.email ?? '',
      mobile: u.mobile,
      role: u.role,
      organizationId: u.organizationId,
      isActive: u.isActive,
      createdAt: u.createdAt,
      interestedIn: u.interestedIn ?? '',
      profileAnswers: profileAnswersMap.get(String(u._id))?.answers || {},
      profileCompletionPercentage: profileAnswersMap.get(String(u._id))?.completionPercentage ?? 0,
      profileIsComplete: profileAnswersMap.get(String(u._id))?.isComplete ?? false,
      subscriptionTier: premiumUserIds.has(String(u._id)) ? 'premium' : 'free',
      courses: enrollmentMap.get(String(u._id)) || [],
    }));

    const totalPages = Math.max(1, Math.ceil(total / limitNum));
    return res.json({
      data,
      meta: { page: pageNum, limit: limitNum, total, totalPages },
    });
  } catch (err) {
    console.error('listUsersAdmin error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/user/admin/export – admin: all users with courses (no pagination)
const exportUsersAdmin = async (req, res) => {
  try {
    const requesterRole = req.user?.role;
    const requesterOrgId = req.user?.organizationId;
    if (!requesterRole || (requesterRole !== 'SUPER_ADMIN' && requesterRole !== 'ORG_ADMIN')) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { role, search } = req.query;

    const filter = {};
    if (requesterRole === 'ORG_ADMIN' && requesterOrgId) {
      filter.organizationId = requesterOrgId;
    }
    if (role) {
      filter.role = role;
    }
    if (search && typeof search === 'string') {
      const q = search.trim();
      if (q) {
        filter.$or = [
          { name: new RegExp(q, 'i') },
          { email: new RegExp(q, 'i') },
          { mobile: new RegExp(q, 'i') },
        ];
      }
    }

    const users = await User.find(filter).sort({ createdAt: -1 }).lean();
    if (!users.length) {
      return res.json({ data: [], total: 0 });
    }

    const userIds = users.map((u) => u._id);
    const now = new Date();
    const [enrollments, premiumUserIds, profileAnswerDocs] = await Promise.all([
      Enrollment.find(
        { userId: { $in: userIds } },
        { userId: 1, courseId: 1, finalPricePaid: 1, status: 1 }
      )
        .populate('courseId', 'title basePrice')
        .lean(),
      distinctUserIdsWithActivePremium(userIds, now),
      UserProfileAnswers.find(
        { userId: { $in: userIds } },
        { userId: 1, answers: 1, completionPercentage: 1, isComplete: 1 }
      ).lean(),
    ]);

    const enrollmentMap = new Map();
    for (const e of enrollments) {
      const key = String(e.userId);
      if (!enrollmentMap.has(key)) enrollmentMap.set(key, []);
      enrollmentMap.get(key).push({
        courseId: e.courseId?._id || e.courseId,
        courseTitle: e.courseId?.title || '',
        basePrice: e.courseId?.basePrice ?? null,
        finalPricePaid: e.finalPricePaid,
        status: e.status,
        enrolledAt: e.createdAt,
      });
    }

    const profileAnswersMap = buildProfileAnswersMap(profileAnswerDocs);

    const data = users.map((u) => ({
      _id: u._id,
      name: u.name,
      email: u.email ?? '',
      mobile: u.mobile,
      role: u.role,
      organizationId: u.organizationId,
      isActive: u.isActive,
      createdAt: u.createdAt,
      interestedIn: u.interestedIn ?? '',
      profileAnswers: profileAnswersMap.get(String(u._id))?.answers || {},
      profileCompletionPercentage: profileAnswersMap.get(String(u._id))?.completionPercentage ?? 0,
      profileIsComplete: profileAnswersMap.get(String(u._id))?.isComplete ?? false,
      subscriptionTier: premiumUserIds.has(String(u._id)) ? 'premium' : 'free',
      courses: enrollmentMap.get(String(u._id)) || [],
    }));

    return res.json({ data, total: data.length });
  } catch (err) {
    console.error('exportUsersAdmin error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = { getProfile, updateProfile, listUsersAdmin, exportUsersAdmin };
