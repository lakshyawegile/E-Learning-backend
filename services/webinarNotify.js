const { Notification, User } = require('../models');
const { sendPushBatches } = require('./newsNotify');

/**
 * Notify all active users about an upcoming webinar.
 * FCM + in-app payload:
 *   data: { type: "webinar", seminarId?, linkUrl }
 *   linkUrl: admin-provided page URL (or webinar://<seminarId>)
 */
async function notifyAllUsersAboutWebinar({
  title,
  body,
  imageUrl = '',
  linkUrl = '',
  seminarId = null,
}) {
  const notificationTitle = String(title || '').trim();
  const notificationBody = String(body || '').trim();
  const notificationImageUrl = String(imageUrl || '').trim();
  const seminarIdStr = seminarId ? String(seminarId) : '';
  const resolvedLinkUrl =
    String(linkUrl || '').trim() ||
    (seminarIdStr ? `webinar://${seminarIdStr}` : '');

  const data = {
    type: 'webinar',
    ...(seminarIdStr ? { seminarId: seminarIdStr } : {}),
    ...(resolvedLinkUrl ? { linkUrl: resolvedLinkUrl } : {}),
  };

  if (!notificationTitle || !notificationBody) {
    return {
      sentCount: 0,
      push: { successCount: 0, failureCount: 0, skipped: true, reason: 'MISSING_TITLE_OR_BODY' },
      linkUrl: resolvedLinkUrl,
      data,
    };
  }

  const userIds = await User.find({ role: 'USER', isActive: true }).distinct('_id');
  if (!userIds.length) {
    return {
      sentCount: 0,
      push: { successCount: 0, failureCount: 0, skipped: true, reason: 'NO_USERS' },
      linkUrl: resolvedLinkUrl,
      data,
    };
  }

  const docs = userIds.map((userId) => ({
    userId,
    title: notificationTitle,
    body: notificationBody,
    imageUrl: notificationImageUrl,
    linkUrl: resolvedLinkUrl,
    source: 'WEBINAR_AUTO',
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
  const push = await sendPushBatches(tokens, {
    title: notificationTitle,
    body: notificationBody,
    imageUrl: notificationImageUrl,
    data,
  });

  return {
    sentCount: userIds.length,
    push,
    linkUrl: resolvedLinkUrl,
    data,
  };
}

/**
 * Same webinar notification payload as production, but for a single user (test/temp).
 */
async function notifyUserAboutWebinar(userId, {
  title,
  body,
  imageUrl = '',
  linkUrl = '',
  seminarId = null,
} = {}) {
  const notificationTitle = String(title || '').trim();
  const notificationBody = String(body || '').trim();
  const notificationImageUrl = String(imageUrl || '').trim();
  const seminarIdStr = seminarId ? String(seminarId) : '';
  const resolvedLinkUrl =
    String(linkUrl || '').trim() ||
    (seminarIdStr ? `webinar://${seminarIdStr}` : '');

  const data = {
    type: 'webinar',
    ...(seminarIdStr ? { seminarId: seminarIdStr } : {}),
    ...(resolvedLinkUrl ? { linkUrl: resolvedLinkUrl } : {}),
  };

  if (!userId) {
    return { sentCount: 0, push: { skipped: true, reason: 'NO_USER_ID' }, linkUrl: resolvedLinkUrl, data };
  }
  if (!notificationTitle || !notificationBody) {
    return {
      sentCount: 0,
      push: { skipped: true, reason: 'MISSING_TITLE_OR_BODY' },
      linkUrl: resolvedLinkUrl,
      data,
    };
  }

  const user = await User.findById(userId).select('_id fcmToken').lean();
  if (!user) {
    return { sentCount: 0, push: { skipped: true, reason: 'USER_NOT_FOUND' }, linkUrl: resolvedLinkUrl, data };
  }

  const notification = await Notification.create({
    userId: user._id,
    title: notificationTitle,
    body: notificationBody,
    imageUrl: notificationImageUrl,
    linkUrl: resolvedLinkUrl,
    source: 'WEBINAR_AUTO',
    data,
  });

  const token = user.fcmToken ? String(user.fcmToken).trim() : '';
  const push = token
    ? await sendPushBatches([token], {
        title: notificationTitle,
        body: notificationBody,
        imageUrl: notificationImageUrl,
        data,
      })
    : { successCount: 0, failureCount: 0, skipped: true, reason: 'NO_FCM_TOKEN' };

  return {
    sentCount: 1,
    notificationId: String(notification._id),
    push,
    linkUrl: resolvedLinkUrl,
    title: notificationTitle,
    body: notificationBody,
    imageUrl: notificationImageUrl,
    data,
  };
}

module.exports = {
  notifyAllUsersAboutWebinar,
  notifyUserAboutWebinar,
};
