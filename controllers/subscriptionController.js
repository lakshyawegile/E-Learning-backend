const { CourseSubscription, User, Course, PlatformPremiumAccess } = require('../models');
const paginate = require('../utils/pagination');
const logger = require('../utils/logger');

// POST /api/subscriptions
const createSubscription = async (req, res) => {
  try {
    const { userId, courseId, organizationId, subscribedBy, startDate, endDate, notes } = req.body;
    
    if (!userId || !courseId || !organizationId || !subscribedBy || !endDate) {
      return res.status(400).json({ 
        message: 'userId, courseId, organizationId, subscribedBy, and endDate are required' 
      });
    }

    // Validate that user and course exist
    const [user, course] = await Promise.all([
      User.findById(userId),
      Course.findById(courseId)
    ]);

    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!course) return res.status(404).json({ message: 'Course not found' });

    const subscription = await CourseSubscription.create({
      userId,
      courseId,
      organizationId,
      subscribedBy,
      startDate: startDate || new Date(),
      endDate,
      notes: notes || '',
    });

    const populatedSubscription = await CourseSubscription.findById(subscription._id)
      .populate('userId', 'name email mobile')
      .populate('courseId', 'title basePrice')
      .populate('subscribedBy', 'name email')
      .lean();

    return res.status(201).json(populatedSubscription);
  } catch (err) {
    logger.error('createSubscription error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/subscriptions
const listSubscriptions = async (req, res) => {
  try {
    const { page, limit, organizationId, status, userId, courseId } = req.query;
    
    const filter = {};
    if (organizationId) filter.organizationId = organizationId;
    if (status) filter.status = status;
    if (userId) filter.userId = userId;
    if (courseId) filter.courseId = courseId;

    const result = await paginate(CourseSubscription, {
      filter,
      page,
      limit,
      sort: { createdAt: -1 },
      populate: [
        { path: 'userId', select: 'name email mobile' },
        { path: 'courseId', select: 'title basePrice' },
        { path: 'subscribedBy', select: 'name email' }
      ]
    });

    return res.json(result);
  } catch (err) {
    logger.error('listSubscriptions error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/subscriptions/:subscriptionId
const getSubscription = async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    
    const subscription = await CourseSubscription.findById(subscriptionId)
      .populate('userId', 'name email mobile')
      .populate('courseId', 'title description basePrice')
      .populate('subscribedBy', 'name email')
      .lean();

    if (!subscription) {
      return res.status(404).json({ message: 'Subscription not found' });
    }

    return res.json(subscription);
  } catch (err) {
    logger.error('getSubscription error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// PUT /api/subscriptions/:subscriptionId
const updateSubscription = async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const { startDate, endDate, status, notes } = req.body;

    const subscription = await CourseSubscription.findById(subscriptionId);
    if (!subscription) {
      return res.status(404).json({ message: 'Subscription not found' });
    }

    if (startDate !== undefined) subscription.startDate = startDate;
    if (endDate !== undefined) subscription.endDate = endDate;
    if (status !== undefined) subscription.status = status;
    if (notes !== undefined) subscription.notes = notes;

    await subscription.save();

    const updatedSubscription = await CourseSubscription.findById(subscriptionId)
      .populate('userId', 'name email mobile')
      .populate('courseId', 'title basePrice')
      .populate('subscribedBy', 'name email')
      .lean();

    return res.json(updatedSubscription);
  } catch (err) {
    logger.error('updateSubscription error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// DELETE /api/subscriptions/:subscriptionId
const cancelSubscription = async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    
    const subscription = await CourseSubscription.findByIdAndUpdate(
      subscriptionId,
      { status: 'CANCELLED' },
      { new: true }
    );

    if (!subscription) {
      return res.status(404).json({ message: 'Subscription not found' });
    }

    return res.json({ message: 'Subscription cancelled', subscription });
  } catch (err) {
    logger.error('cancelSubscription error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/subscriptions/me/status
const checkMySubscriptionStatus = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized', active: false });
    }

    const now = new Date();
    const windowFilter = {
      userId,
      status: 'ACTIVE',
      startDate: { $lte: now },
      endDate: { $gte: now },
    };

    const [activeSubscriptions, activePlatform] = await Promise.all([
      CourseSubscription.find(windowFilter)
        .populate('courseId', 'title basePrice')
        .lean(),
      PlatformPremiumAccess.findOne(windowFilter).sort({ endDate: -1 }).lean(),
    ]);

    const active = activeSubscriptions.length > 0 || Boolean(activePlatform);

    return res.json({
      active,
      count: activeSubscriptions.length,
      subscriptions: activeSubscriptions,
      platformPremium: activePlatform
        ? {
            _id: activePlatform._id,
            startDate: activePlatform.startDate,
            endDate: activePlatform.endDate,
            notes: activePlatform.notes,
          }
        : null,
    });
  } catch (err) {
    logger.error('checkMySubscriptionStatus error:', err);
    return res.status(500).json({ message: 'Internal server error', active: false });
  }
};

// GET /api/subscriptions/user/:userId
const getUserSubscriptions = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page, limit, status = 'ACTIVE' } = req.query;

    const filter = { userId };
    if (status && status !== 'ALL') filter.status = status;

    const result = await paginate(CourseSubscription, {
      filter,
      page,
      limit,
      sort: { createdAt: -1 },
      populate: [
        { path: 'courseId', select: 'title description basePrice' },
        { path: 'subscribedBy', select: 'name email' }
      ]
    });

    return res.json(result);
  } catch (err) {
    logger.error('getUserSubscriptions error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  createSubscription,
  listSubscriptions,
  getSubscription,
  updateSubscription,
  cancelSubscription,
  checkMySubscriptionStatus,
  getUserSubscriptions,
};
