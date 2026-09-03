const { ScheduledNotification } = require('../models');
const paginate = require('../utils/pagination');
const { normalizeBroadcastInput } = require('../services/notificationBroadcast');

// POST /api/notifications/schedule (admin)
const createScheduledNotification = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    const createdBy = req.user?.userId || null;
    if (!organizationId) return res.status(400).json({ message: 'User organization not found' });

    const normalized = normalizeBroadcastInput(req.body);
    if (!normalized.ok) {
      return res.status(400).json({ message: normalized.message });
    }

    const scheduledFor = new Date(req.body?.scheduledFor);
    if (Number.isNaN(scheduledFor.getTime())) {
      return res.status(400).json({ message: 'A valid scheduledFor date/time is required' });
    }
    if (scheduledFor.getTime() <= Date.now()) {
      return res.status(400).json({ message: 'scheduledFor must be in the future' });
    }

    const doc = await ScheduledNotification.create({
      organizationId,
      createdBy,
      ...normalized.payload,
      scheduledFor,
    });

    return res.status(201).json(doc);
  } catch (err) {
    console.error('createScheduledNotification error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/notifications/schedule (admin)
const listScheduledNotifications = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(400).json({ message: 'User organization not found' });

    const { page, limit, status } = req.query;
    const filter = { organizationId };
    if (status) filter.status = status;

    const result = await paginate(ScheduledNotification, {
      filter,
      page,
      limit,
      sort: { scheduledFor: 1 },
    });
    return res.json(result);
  } catch (err) {
    console.error('listScheduledNotifications error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// DELETE /api/notifications/schedule/:id (admin)
const cancelScheduledNotification = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(400).json({ message: 'User organization not found' });

    const { id } = req.params;
    const deleted = await ScheduledNotification.findOneAndDelete({
      _id: id,
      organizationId,
      status: 'PENDING',
    });
    if (!deleted) {
      return res.status(404).json({ message: 'Pending scheduled notification not found' });
    }
    return res.json({ message: 'Scheduled notification cancelled' });
  } catch (err) {
    console.error('cancelScheduledNotification error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  createScheduledNotification,
  listScheduledNotifications,
  cancelScheduledNotification,
};
