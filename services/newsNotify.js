const { Notification, User } = require('../models');
const { sendToTokens } = require('../utils/notificationHelper');

const FCM_BATCH_SIZE = 500;

async function sendPushBatches(tokens, { title, body, imageUrl, data }) {
  const list = Array.isArray(tokens) ? tokens.filter(Boolean) : [];
  if (!list.length) {
    return { successCount: 0, failureCount: 0, skipped: true, reason: 'NO_TOKENS' };
  }

  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < list.length; i += FCM_BATCH_SIZE) {
    const batch = list.slice(i, i + FCM_BATCH_SIZE);
    const result = await sendToTokens({ tokens: batch, title, body, imageUrl, data });
    if (result.success) {
      successCount += result.successCount || 0;
      failureCount += result.failureCount || 0;
    }
  }

  return { successCount, failureCount };
}

/**
 * Creates in-app notifications for all active USER accounts and sends FCM push
 * with news deep-link payload.
 *
 * In-app: linkUrl = news://<newsId>, data = { type, newsId }
 * FCM data: { type: "news", newsId: "<id>" }
 */
async function notifyAllUsersAboutNews(news) {
  const newsId = String(news._id);
  const title = String(news.title || '').trim();
  const body = String(news.description || '').trim();
  const imageUrl = String(news.imageUrl || '').trim();
  const linkUrl = `news://${newsId}`;
  const data = { type: 'news', newsId };

  if (!title || !body) {
    return {
      sentCount: 0,
      push: { successCount: 0, failureCount: 0, skipped: true, reason: 'MISSING_TITLE_OR_BODY' },
    };
  }

  const userIds = await User.find({ role: 'USER', isActive: true }).distinct('_id');
  if (!userIds.length) {
    return {
      sentCount: 0,
      push: { successCount: 0, failureCount: 0, skipped: true, reason: 'NO_USERS' },
    };
  }

  const docs = userIds.map((userId) => ({
    userId,
    title,
    body,
    imageUrl,
    linkUrl,
    source: 'NEWS_AUTO',
    data,
  }));

  await Notification.insertMany(docs, { ordered: false });

  const usersWithTokens = await User.find({
    _id: { $in: userIds },
    fcmToken: { $exists: true, $ne: '' },
  })
    .select('fcmToken')
    .lean();

  const tokens = usersWithTokens.map((u) => String(u.fcmToken).trim()).filter(Boolean);
  const push = await sendPushBatches(tokens, { title, body, imageUrl, data });

  return { sentCount: userIds.length, push, newsId, linkUrl };
}

/**
 * Same news notification payload as production, but for a single user (test/temp).
 */
async function notifyUserAboutNews(userId, news) {
  const newsId = String(news._id);
  const title = String(news.title || '').trim();
  const body = String(news.description || '').trim();
  const imageUrl = String(news.imageUrl || '').trim();
  const linkUrl = `news://${newsId}`;
  const data = { type: 'news', newsId };

  if (!userId) {
    return { sentCount: 0, push: { skipped: true, reason: 'NO_USER_ID' }, newsId, linkUrl };
  }
  if (!title || !body) {
    return {
      sentCount: 0,
      push: { skipped: true, reason: 'MISSING_TITLE_OR_BODY' },
      newsId,
      linkUrl,
    };
  }

  const user = await User.findById(userId).select('_id fcmToken').lean();
  if (!user) {
    return { sentCount: 0, push: { skipped: true, reason: 'USER_NOT_FOUND' }, newsId, linkUrl };
  }

  const notification = await Notification.create({
    userId: user._id,
    title,
    body,
    imageUrl,
    linkUrl,
    source: 'NEWS_AUTO',
    data,
  });

  const token = user.fcmToken ? String(user.fcmToken).trim() : '';
  const push = token
    ? await sendPushBatches([token], { title, body, imageUrl, data })
    : { successCount: 0, failureCount: 0, skipped: true, reason: 'NO_FCM_TOKEN' };

  return {
    sentCount: 1,
    notificationId: String(notification._id),
    push,
    newsId,
    linkUrl,
    title,
    body,
  };
}

module.exports = {
  notifyAllUsersAboutNews,
  notifyUserAboutNews,
  sendPushBatches,
};
