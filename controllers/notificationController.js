const { Types } = require('mongoose');
const { Notification, User, News } = require('../models');
const paginate = require('../utils/pagination');
const { distinctUserIdsWithActivePremium } = require('../utils/distinctUserIdsWithActivePremium');
const { sendPushBatches, notifyUserAboutNews } = require('../services/newsNotify');
const { notifyUserAboutWebinar } = require('../services/webinarNotify');

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function buildInterestedInFilter(interestedIn) {
  if (interestedIn === 'import') return { interestedIn: { $in: ['import', 'both'] } };
  if (interestedIn === 'export') return { interestedIn: { $in: ['export', 'both'] } };
  return {};
}

async function resolveTargetUserIds({ audience, customUsers, newUser, interestedIn, premium }) {
  const baseFilter = { role: 'USER', isActive: true, ...buildInterestedInFilter(interestedIn) };

  let userIds = [];

  if (audience === 'custom') {
    const rawIds = String(customUsers || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    const validIds = rawIds.filter((id) => Types.ObjectId.isValid(id));
    if (!validIds.length) return [];

    userIds = await User.find({ _id: { $in: validIds }, ...baseFilter }).distinct('_id');
  } else if (audience === 'new') {
    const mode = newUser?.mode || 'today';
    const anchor =
      mode === 'date' && newUser?.date
        ? startOfDay(new Date(newUser.date))
        : startOfDay(new Date());
    const end = new Date(anchor);
    end.setDate(end.getDate() + 1);

    userIds = await User.find({
      ...baseFilter,
      createdAt: { $gte: anchor, $lt: end },
    }).distinct('_id');
  } else {
    userIds = await User.find(baseFilter).distinct('_id');
  }

  if (!userIds.length || premium === 'any') return userIds;

  const premiumSet = await distinctUserIdsWithActivePremium(userIds);
  if (premium === 'premium') {
    return userIds.filter((id) => premiumSet.has(String(id)));
  }
  if (premium === 'non-premium') {
    return userIds.filter((id) => !premiumSet.has(String(id)));
  }
  return userIds;
}

// POST /api/notifications/broadcast (admin)
const broadcastNotification = async (req, res) => {
  try {
    const {
      audience = 'all',
      customUsers,
      newUser,
      interestedIn = 'any',
      premium = 'any',
      title,
      message,
      body,
      imageUrl,
      newsId,
      linkUrl,
      data,
    } = req.body;

    const notificationTitle = String(title || '').trim();
    const notificationBody = String(message ?? body ?? '').trim();
    const notificationImageUrl = String(imageUrl || '').trim();
    const resolvedNewsId = String(newsId || data?.newsId || '').trim();
    const notificationData =
      data && typeof data === 'object'
        ? { ...data }
        : resolvedNewsId
          ? { type: 'news', newsId: resolvedNewsId }
          : null;
    if (resolvedNewsId) {
      notificationData.type = notificationData.type || 'news';
      notificationData.newsId = resolvedNewsId;
    }
    const notificationLinkUrl = String(
      linkUrl || (resolvedNewsId ? `news://${resolvedNewsId}` : '')
    ).trim();

    if (!notificationTitle || !notificationBody) {
      return res.status(400).json({ message: 'title and message are required' });
    }
    if (!['all', 'custom', 'new'].includes(audience)) {
      return res.status(400).json({ message: 'Invalid audience' });
    }
    if (audience === 'custom' && !String(customUsers || '').trim()) {
      return res.status(400).json({ message: 'customUsers is required for custom audience' });
    }
    if (audience === 'new' && newUser?.mode === 'date' && !newUser?.date) {
      return res.status(400).json({ message: 'newUser.date is required when mode is date' });
    }

    const userIds = await resolveTargetUserIds({
      audience,
      customUsers,
      newUser,
      interestedIn,
      premium,
    });

    if (!userIds.length) {
      return res.json({
        success: true,
        message: 'No users matched the selected filters',
        sentCount: 0,
        push: { successCount: 0, failureCount: 0, skipped: true, reason: 'NO_USERS' },
      });
    }

    const notifications = userIds.map((userId) => ({
      userId,
      title: notificationTitle,
      body: notificationBody,
      imageUrl: notificationImageUrl,
      linkUrl: notificationLinkUrl,
      data: notificationData,
      source: 'ADMIN_PANEL',
    }));

    await Notification.insertMany(notifications, { ordered: false });

    const usersWithTokens = await User.find({
      _id: { $in: userIds },
      fcmToken: { $exists: true, $ne: '' },
    })
      .select('fcmToken')
      .lean();
    const tokens = usersWithTokens.map((u) => String(u.fcmToken).trim()).filter(Boolean);
    const push = await sendPushBatches(tokens, {
      title: notificationTitle,
      body: notificationBody,
      imageUrl: notificationImageUrl,
      data: notificationData || undefined,
    });

    return res.status(201).json({
      success: true,
      message: `Notification sent to ${userIds.length} user(s)`,
      sentCount: userIds.length,
      push,
    });
  } catch (err) {
    console.error('broadcastNotification error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// POST /api/notifications
const createNotification = async (req, res) => {
  try {
    const { userId, title, body, source, linkUrl, imageUrl, data } = req.body;

    if (!userId || !title) {
      return res.status(400).json({ message: 'userId and title are required' });
    }

    const notification = await Notification.create({
      userId,
      title,
      body: body ?? '',
      source: source ?? 'CUSTOM',
      linkUrl: linkUrl ?? '',
      imageUrl: imageUrl ?? '',
      data: data ?? null,
    });

    return res.status(201).json(notification);
  } catch (err) {
    console.error('createNotification error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/notifications
const listMyNotifications = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { page, limit, read } = req.query;
    const filter = { userId };
    if (read !== undefined && read !== '') {
      filter.read = read === 'true' || read === true;
    }

    const result = await paginate(Notification, {
      filter,
      page,
      limit,
      sort: { createdAt: -1 },
    });

    return res.json(result);
  } catch (err) {
    console.error('listMyNotifications error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/notifications/unread-count
const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const count = await Notification.countDocuments({ userId, read: false });
    return res.json({ unreadCount: count });
  } catch (err) {
    console.error('getUnreadCount error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// PATCH /api/notifications/:notificationId/read
const markAsRead = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { notificationId } = req.params;
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, userId },
      { $set: { read: true } },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    return res.json(notification);
  } catch (err) {
    console.error('markAsRead error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// PATCH /api/notifications/read-all
const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const result = await Notification.updateMany(
      { userId, read: false },
      { $set: { read: true } }
    );
    return res.json({ message: 'All marked as read', modifiedCount: result.modifiedCount });
  } catch (err) {
    console.error('markAllAsRead error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * TEMP / TEST ONLY
 * POST /api/notifications/test-news
 * Body: { userId, newsId? }
 * Picks a random published news (or given newsId) and sends the same news
 * notification payload (in-app + FCM) to that one user.
 */
const testNewsNotification = async (req, res) => {
  try {
    const userId = String(req.body?.userId || '').trim();
    const newsId = String(req.body?.newsId || '').trim();

    if (!userId || !Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: 'Valid userId is required' });
    }

    let news = null;
    if (newsId) {
      if (!Types.ObjectId.isValid(newsId)) {
        return res.status(400).json({ success: false, message: 'Invalid newsId' });
      }
      news = await News.findById(newsId).lean();
      if (!news) {
        return res.status(404).json({ success: false, message: 'News not found' });
      }
    } else {
      const hasImage = { imageUrl: { $exists: true, $nin: [null, ''] } };
      const [randomPublished] = await News.aggregate([
        { $match: { isPublished: true, ...hasImage } },
        { $sample: { size: 1 } },
      ]);
      news = randomPublished || null;
      if (!news) {
        const [randomAny] = await News.aggregate([
          { $match: hasImage },
          { $sample: { size: 1 } },
        ]);
        news = randomAny || null;
      }
      if (!news) {
        return res.status(404).json({
          success: false,
          message: 'No news with imageUrl found in database',
        });
      }
    }

    const result = await notifyUserAboutNews(userId, news);
    if (result.push?.reason === 'USER_NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.status(201).json({
      success: true,
      message: 'Test news notification sent',
      temporary: true,
      news: {
        _id: news._id,
        title: news.title,
        description: news.description,
      },
      payload: {
        type: 'news',
        newsId: result.newsId,
        linkUrl: result.linkUrl,
        title: result.title,
        body: result.body,
      },
      result,
    });
  } catch (err) {
    console.error('testNewsNotification error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** Static defaults for TEMP webinar test push (override via body). */
const DEFAULT_TEST_WEBINAR = {
  title: 'Free Online Webinar at 7 PM',
  body: 'Join our free import-export webinar tonight at 7 PM IST. Tap to open the webinar page.',
  imageUrl: 'https://images.unsplash.com/photo-1591115765373-5207764f72e7?w=1200',
  linkUrl: 'https://siiea.com/webinar',
};

/**
 * TEMP / TEST ONLY
 * POST /api/notifications/test-webinar
 * Body: { userId, title?, message?/body?, imageUrl?, linkUrl?, seminarId? }
 * Sends the same webinar notification payload (in-app + FCM) to that one user.
 */
const testWebinarNotification = async (req, res) => {
  try {
    const userId = String(req.body?.userId || '').trim();
    if (!userId || !Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: 'Valid userId is required' });
    }

    const title = String(req.body?.title || DEFAULT_TEST_WEBINAR.title).trim();
    const body = String(
      req.body?.body ?? req.body?.message ?? DEFAULT_TEST_WEBINAR.body
    ).trim();
    const imageUrl = String(req.body?.imageUrl || DEFAULT_TEST_WEBINAR.imageUrl).trim();
    const linkUrl = String(req.body?.linkUrl || DEFAULT_TEST_WEBINAR.linkUrl).trim();
    const seminarId = String(req.body?.seminarId || '').trim() || null;

    if (!title || !body) {
      return res.status(400).json({ success: false, message: 'title and message/body are required' });
    }
    if (!imageUrl) {
      return res.status(400).json({ success: false, message: 'imageUrl is required' });
    }
    if (!linkUrl && !seminarId) {
      return res.status(400).json({
        success: false,
        message: 'linkUrl or seminarId is required',
      });
    }

    const result = await notifyUserAboutWebinar(userId, {
      title,
      body,
      imageUrl,
      linkUrl,
      seminarId,
    });

    if (result.push?.reason === 'USER_NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.status(201).json({
      success: true,
      message: 'Test webinar notification sent',
      temporary: true,
      payload: {
        type: 'webinar',
        seminarId: seminarId || undefined,
        linkUrl: result.linkUrl,
        title: result.title,
        body: result.body,
        imageUrl: result.imageUrl,
      },
      result,
    });
  } catch (err) {
    console.error('testWebinarNotification error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = {
  broadcastNotification,
  createNotification,
  listMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  testNewsNotification,
  testWebinarNotification,
};
