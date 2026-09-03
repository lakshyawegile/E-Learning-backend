const { Types } = require('mongoose');
const { Notification, User } = require('../models');
const { distinctUserIdsWithActivePremium } = require('../utils/distinctUserIdsWithActivePremium');
const { sendPushBatches } = require('./newsNotify');

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
    if (newUser?.days) {
      // Matches the dashboard's "New Users (Xd)" stat card exactly: created within the
      // last N days up to now, rather than a single anchor day.
      const days = Math.max(1, Math.min(90, parseInt(newUser.days, 10) || 30));
      const rangeStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      userIds = await User.find({
        ...baseFilter,
        createdAt: { $gte: rangeStart },
      }).distinct('_id');
    } else {
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
    }
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

// Validates + normalizes a raw broadcast-shaped input (from req.body or a
// ScheduledNotification doc) into the exact fields sendBroadcastNotification
// needs. Returns { ok: true, payload } or { ok: false, message }.
function normalizeBroadcastInput(raw) {
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
  } = raw || {};

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
    return { ok: false, message: 'title and message are required' };
  }
  if (!['all', 'custom', 'new'].includes(audience)) {
    return { ok: false, message: 'Invalid audience' };
  }
  if (audience === 'custom' && !String(customUsers || '').trim()) {
    return { ok: false, message: 'customUsers is required for custom audience' };
  }
  if (audience === 'new' && newUser?.mode === 'date' && !newUser?.date) {
    return { ok: false, message: 'newUser.date is required when mode is date' };
  }

  return {
    ok: true,
    payload: {
      audience,
      customUsers,
      newUser,
      interestedIn,
      premium,
      title: notificationTitle,
      body: notificationBody,
      imageUrl: notificationImageUrl,
      linkUrl: notificationLinkUrl,
      data: notificationData,
    },
  };
}

// Resolves targets, inserts Notification docs, sends push. Assumes `payload`
// has already been through normalizeBroadcastInput.
async function sendBroadcastNotification(payload) {
  const userIds = await resolveTargetUserIds(payload);

  if (!userIds.length) {
    return {
      sentCount: 0,
      push: { successCount: 0, failureCount: 0, skipped: true, reason: 'NO_USERS' },
    };
  }

  const notifications = userIds.map((userId) => ({
    userId,
    title: payload.title,
    body: payload.body,
    imageUrl: payload.imageUrl,
    linkUrl: payload.linkUrl,
    data: payload.data,
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
    title: payload.title,
    body: payload.body,
    imageUrl: payload.imageUrl,
    data: payload.data || undefined,
  });

  return { sentCount: userIds.length, push };
}

module.exports = { resolveTargetUserIds, normalizeBroadcastInput, sendBroadcastNotification };
