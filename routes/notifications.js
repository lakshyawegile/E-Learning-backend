const express = require('express');
const requireOrgAdmin = require('../middlewares/requireOrgAdmin');
const {
  broadcastNotification,
  createNotification,
  listMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  testNewsNotification,
  testWebinarNotification,
} = require('../controllers/notificationController');
const {
  createScheduledNotification,
  listScheduledNotifications,
  cancelScheduledNotification,
} = require('../controllers/scheduledNotificationController');

const router = express.Router();

// TEMP: no auth (parent skips JWT for these paths)
router.post('/test-news', testNewsNotification);
router.post('/test-webinar', testWebinarNotification);

router.post('/broadcast', requireOrgAdmin, broadcastNotification);
router.post('/schedule', requireOrgAdmin, createScheduledNotification);
router.get('/schedule', requireOrgAdmin, listScheduledNotifications);
router.delete('/schedule/:id', requireOrgAdmin, cancelScheduledNotification);
router.post('/', requireOrgAdmin, createNotification);
router.get('/', listMyNotifications);
router.get('/unread-count', getUnreadCount);
router.patch('/read-all', markAllAsRead);
router.patch('/:notificationId/read', markAsRead);

module.exports = router;
