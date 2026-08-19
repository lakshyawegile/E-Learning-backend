const fs = require('fs');
const path = require('path');

const admin = require('firebase-admin');

const { User } = require('../models');

let firebaseApp = null;

function getServiceAccountPath() {
  // Prefer env; fallback to the filename currently in repo
  return (
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    path.join(process.cwd(), 'importexport-645ff-firebase-adminsdk-fbsvc-85d2506060.json')
  );
}

function initFirebase() {
  if (firebaseApp) return firebaseApp;
  if (admin.apps && admin.apps.length) {
    firebaseApp = admin.app();
    return firebaseApp;
  }

  const serviceAccountPath = getServiceAccountPath();
  const raw = fs.readFileSync(serviceAccountPath, 'utf-8');
  const serviceAccount = JSON.parse(raw);

  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  return firebaseApp;
}

function buildMessage({ token, tokens, title, body, imageUrl, data }) {
  const notificationTitle = String(title || '');
  const notificationBody = String(body || '');
  const trimmedImageUrl = String(imageUrl || '').trim();

  const mergedData = {
    title: notificationTitle,
    body: notificationBody,
    ...(data && typeof data === 'object' ? data : {}),
  };
  if (trimmedImageUrl) {
    mergedData.imageUrl = trimmedImageUrl;
    mergedData.notificationStyle = 'big_picture';
  }

  const payload = {
    notification: {
      title: notificationTitle,
      body: notificationBody,
    },
    data: Object.fromEntries(
      Object.entries(mergedData).map(([k, v]) => [String(k), v == null ? '' : String(v)])
    ),
  };

  if (trimmedImageUrl) {
    // Image only in platform blocks (Firebase recommended). Top-level imageUrl
    // often renders as a small thumbnail on the right in collapsed notifications.
    payload.android = {
      priority: 'high',
      notification: {
        imageUrl: trimmedImageUrl,
      },
    };
    payload.apns = {
      payload: {
        aps: {
          'mutable-content': 1,
        },
      },
      fcmOptions: {
        imageUrl: trimmedImageUrl,
      },
    };
  }

  if (token) return { token, ...payload };
  if (tokens) return { tokens, ...payload };
  throw new Error('token or tokens is required');
}

async function sendToToken({ token, title, body, imageUrl, data }) {
  if (!token) return { success: false, skipped: true, reason: 'NO_TOKEN' };
  initFirebase();

  const message = buildMessage({ token, title, body, imageUrl, data });
  const messageId = await admin.messaging().send(message);
  return { success: true, messageId };
}

async function sendToTokens({ tokens, title, body, imageUrl, data }) {
  const list = Array.isArray(tokens) ? tokens.filter(Boolean) : [];
  if (!list.length) return { success: false, skipped: true, reason: 'NO_TOKENS' };
  initFirebase();

  const message = buildMessage({ tokens: list, title, body, imageUrl, data });
  const result = await admin.messaging().sendEachForMulticast(message);

  return {
    success: true,
    successCount: result.successCount,
    failureCount: result.failureCount,
    responses: result.responses?.map((r) => ({
      success: r.success,
      messageId: r.messageId || null,
      error: r.error ? { message: r.error.message, code: r.error.code } : null,
    })),
  };
}

async function sendToUserId({ userId, title, body, imageUrl, data }) {
  if (!userId) return { success: false, skipped: true, reason: 'NO_USER_ID' };

  const user = await User.findById(userId).lean();
  const token = user?.fcmToken ? String(user.fcmToken).trim() : '';
  if (!token) return { success: false, skipped: true, reason: 'NO_FCM_TOKEN' };

  return await sendToToken({ token, title, body, imageUrl, data });
}

module.exports = {
  initFirebase,
  sendToToken,
  sendToTokens,
  sendToUserId,
};

