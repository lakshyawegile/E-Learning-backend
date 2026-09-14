const { Types } = require('mongoose');
const { ScheduledWebinarNotification, Seminar } = require('../models');
const paginate = require('../utils/pagination');
const { deleteMediaIfOwned } = require('../utils/mediaCleanup');


// Positive = minutes before the session starts, 0 = at the start,
// negative = minutes after it began (to catch people who missed the reminder).
// A rule may carry several, so it can ping before, at, and during one session.
function normalizeOffsets(raw) {
  const list = Array.isArray(raw) ? raw : [raw];
  const cleaned = [];
  for (const item of list) {
    if (item === undefined || item === null || item === '') continue;
    const n = Number(item);
    if (!Number.isFinite(n) || n < -720 || n > 10080) return null;
    cleaned.push(Math.round(n));
  }
  if (!cleaned.length) return [30];
  // Earliest first, so the stored order reads the way it fires
  return [...new Set(cleaned)].sort((a, b) => b - a);
}

function mapSchedule(doc) {
  return {
    _id: doc._id,
    organizationId: doc.organizationId,
    offsets: Array.isArray(doc.offsets) && doc.offsets.length
      ? doc.offsets
      : [Number.isFinite(doc.offsetMinutes) ? doc.offsetMinutes : 30],
    timezone: doc.timezone,
    title: doc.title,
    body: doc.body,
    imageUrl: doc.imageUrl,
    linkUrl: doc.linkUrl,
    seminarId: doc.seminarId,
    isActive: doc.isActive,
    lastSentOccurrenceKey: doc.lastSentOccurrenceKey,
    lastSentAt: doc.lastSentAt,
    lastSentCount: doc.lastSentCount,
    lastErrorMessage: doc.lastErrorMessage,
    createdBy: doc.createdBy,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/**
 * The linked seminar is the single source of truth: it decides the tap
 * destination and owns the meeting link/passcode. The tap always resolves to
 * the in-app deep link so the notification opens the seminar page (which then
 * offers the join button) — never straight out to Zoom/Meet.
 */
async function resolveSeminarLink({ seminarId, organizationId }) {
  if (!seminarId) {
    const err = new Error('Select a seminar — it decides where the notification opens');
    err.status = 400;
    throw err;
  }
  if (!Types.ObjectId.isValid(seminarId)) {
    const err = new Error('Invalid seminarId');
    err.status = 400;
    throw err;
  }

  const seminar = await Seminar.findOne({ _id: seminarId, organizationId }).lean();
  if (!seminar) {
    const err = new Error('Seminar not found');
    err.status = 404;
    throw err;
  }

  return {
    resolvedSeminarId: seminar._id,
    resolvedLinkUrl: `webinar://${String(seminar._id)}`,
  };
}

// POST /api/webinar-schedules
// Body: { title, message, seminarId, offsets?: number[], imageUrl?, isActive? }
// Days/times are NOT set here — they come from the linked seminar.
const createWebinarSchedule = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    const createdBy = req.user?.userId || null;
    if (!organizationId) {
      return res.status(400).json({ success: false, message: 'User organization not found' });
    }

    const {
      title,
      body,
      message,
      imageUrl,
      seminarId,
      offsets,
      timezone,
      isActive,
    } = req.body || {};

    const notificationTitle = String(title || '').trim();
    const notificationBody = String(body ?? message ?? '').trim();
    if (!notificationTitle || !notificationBody) {
      return res.status(400).json({ success: false, message: 'title and body/message are required' });
    }

    const parsedOffsets = normalizeOffsets(offsets);
    if (parsedOffsets === null) {
      return res.status(400).json({
        success: false,
        message: 'Each send time must be between 12 hours after the start and 7 days before it',
      });
    }

    const { resolvedSeminarId, resolvedLinkUrl } = await resolveSeminarLink({
      seminarId,
      organizationId,
    });

    const job = await ScheduledWebinarNotification.create({
      organizationId,
      createdBy,
      offsets: parsedOffsets,
      timezone: String(timezone || 'Asia/Kolkata').trim() || 'Asia/Kolkata',
      title: notificationTitle,
      body: notificationBody,
      imageUrl: String(imageUrl || '').trim(),
      linkUrl: resolvedLinkUrl,
      seminarId: resolvedSeminarId,
      isActive: isActive === undefined ? true : Boolean(isActive),
    });

    return res.status(201).json({
      success: true,
      message: 'Recurring webinar notification saved',
      data: mapSchedule(job),
    });
  } catch (err) {
    console.error('createWebinarSchedule error:', err);
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /api/webinar-schedules
const listWebinarSchedules = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({ success: false, message: 'User organization not found' });
    }

    const { page, limit, activeOnly } = req.query;
    const filter = { organizationId };
    if (activeOnly === 'true') filter.isActive = true;

    const result = await paginate(ScheduledWebinarNotification, {
      filter,
      page,
      limit: limit || 50,
      sort: { createdAt: -1 },
    });

    return res.json({
      success: true,
      data: (result.data || []).map(mapSchedule),
      meta: result.meta,
    });
  } catch (err) {
    console.error('listWebinarSchedules error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PUT /api/webinar-schedules/:id
const updateWebinarSchedule = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    const { id } = req.params;
    if (!organizationId) {
      return res.status(400).json({ success: false, message: 'User organization not found' });
    }
    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid id' });
    }

    const job = await ScheduledWebinarNotification.findOne({ _id: id, organizationId });
    if (!job) {
      return res.status(404).json({ success: false, message: 'Schedule not found' });
    }

    const {
      title,
      body,
      message,
      imageUrl,
      seminarId,
      offsets,
      timezone,
      isActive,
    } = req.body || {};

    const previousImageUrl = job.imageUrl;

    if (title !== undefined) job.title = String(title || '').trim();
    if (body !== undefined || message !== undefined) {
      job.body = String(body ?? message ?? '').trim();
    }
    if (imageUrl !== undefined) job.imageUrl = String(imageUrl || '').trim();
    if (timezone !== undefined) {
      job.timezone = String(timezone || 'Asia/Kolkata').trim() || 'Asia/Kolkata';
    }
    if (isActive !== undefined) job.isActive = Boolean(isActive);

    if (offsets !== undefined) {
      const parsedOffsets = normalizeOffsets(offsets);
      if (parsedOffsets === null) {
        return res.status(400).json({ success: false, message: 'Each send time must be between 12 hours after the start and 7 days before it' });
      }
      job.offsets = parsedOffsets;
    }

    if (seminarId !== undefined) {
      const { resolvedSeminarId, resolvedLinkUrl } = await resolveSeminarLink({
        seminarId,
        organizationId,
      });
      job.seminarId = resolvedSeminarId;
      job.linkUrl = resolvedLinkUrl;
    }

    if (!job.title || !job.body) {
      return res.status(400).json({ success: false, message: 'title and body are required' });
    }

    await job.save();

    if (previousImageUrl && previousImageUrl !== job.imageUrl) {
      deleteMediaIfOwned(previousImageUrl);
    }

    return res.json({
      success: true,
      message: 'Schedule updated',
      data: mapSchedule(job),
    });
  } catch (err) {
    console.error('updateWebinarSchedule error:', err);
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// DELETE /api/webinar-schedules/:id
const cancelWebinarSchedule = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    const { id } = req.params;
    if (!organizationId) {
      return res.status(400).json({ success: false, message: 'User organization not found' });
    }
    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid id' });
    }

    const deleted = await ScheduledWebinarNotification.findOneAndDelete({
      _id: id,
      organizationId,
    });
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Schedule not found' });
    }

    if (deleted.imageUrl) {
      deleteMediaIfOwned(deleted.imageUrl);
    }

    return res.json({
      success: true,
      message: 'Schedule deleted',
      data: mapSchedule(deleted),
    });
  } catch (err) {
    console.error('cancelWebinarSchedule error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = {
  createWebinarSchedule,
  listWebinarSchedules,
  updateWebinarSchedule,
  cancelWebinarSchedule,
  normalizeOffsets,
};
