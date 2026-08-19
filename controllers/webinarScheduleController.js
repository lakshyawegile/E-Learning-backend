const { Types } = require('mongoose');
const { ScheduledWebinarNotification, Seminar } = require('../models');
const paginate = require('../utils/pagination');

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function normalizeTime(raw) {
  const t = String(raw || '').trim();
  const match = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function normalizeDays(raw) {
  if (!Array.isArray(raw)) return [];
  const unique = [
    ...new Set(
      raw
        .map((d) => Number(d))
        .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    ),
  ].sort((a, b) => a - b);
  return unique;
}

function mapSchedule(doc) {
  const daysOfWeek = Array.isArray(doc.daysOfWeek) ? doc.daysOfWeek : [];
  return {
    _id: doc._id,
    organizationId: doc.organizationId,
    daysOfWeek,
    dayLabels: daysOfWeek.map((d) => DAY_NAMES[d]),
    time: doc.time,
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

async function resolveSeminarLink({ seminarId, organizationId, linkUrl }) {
  let resolvedSeminarId = null;
  let resolvedLinkUrl = String(linkUrl || '').trim();

  if (seminarId) {
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
    resolvedSeminarId = seminar._id;
    if (!resolvedLinkUrl && seminar.meetingUrl) {
      resolvedLinkUrl = seminar.meetingUrl;
    }
  }

  if (!resolvedLinkUrl && !resolvedSeminarId) {
    const err = new Error('linkUrl or seminarId is required so the app can open the webinar page');
    err.status = 400;
    throw err;
  }

  return { resolvedSeminarId, resolvedLinkUrl };
}

// POST /api/webinar-schedules
// Body: { daysOfWeek: [0,2], time: "19:00", title, message, linkUrl?, seminarId?, imageUrl?, isActive? }
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
      linkUrl,
      seminarId,
      daysOfWeek,
      time,
      timezone,
      isActive,
    } = req.body || {};

    const notificationTitle = String(title || '').trim();
    const notificationBody = String(body ?? message ?? '').trim();
    if (!notificationTitle || !notificationBody) {
      return res.status(400).json({ success: false, message: 'title and body/message are required' });
    }

    const days = normalizeDays(daysOfWeek);
    if (!days.length) {
      return res.status(400).json({
        success: false,
        message: 'Select at least one day (daysOfWeek: 0=Sun … 6=Sat)',
      });
    }

    const normalizedTime = normalizeTime(time);
    if (!normalizedTime) {
      return res.status(400).json({
        success: false,
        message: 'Valid time is required (HH:mm), e.g. 19:00',
      });
    }

    const { resolvedSeminarId, resolvedLinkUrl } = await resolveSeminarLink({
      seminarId,
      organizationId,
      linkUrl,
    });

    const job = await ScheduledWebinarNotification.create({
      organizationId,
      createdBy,
      daysOfWeek: days,
      time: normalizedTime,
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
      linkUrl,
      seminarId,
      daysOfWeek,
      time,
      timezone,
      isActive,
    } = req.body || {};

    if (title !== undefined) job.title = String(title || '').trim();
    if (body !== undefined || message !== undefined) {
      job.body = String(body ?? message ?? '').trim();
    }
    if (imageUrl !== undefined) job.imageUrl = String(imageUrl || '').trim();
    if (timezone !== undefined) {
      job.timezone = String(timezone || 'Asia/Kolkata').trim() || 'Asia/Kolkata';
    }
    if (isActive !== undefined) job.isActive = Boolean(isActive);

    if (daysOfWeek !== undefined) {
      const days = normalizeDays(daysOfWeek);
      if (!days.length) {
        return res.status(400).json({ success: false, message: 'Select at least one day' });
      }
      job.daysOfWeek = days;
    }

    if (time !== undefined) {
      const normalizedTime = normalizeTime(time);
      if (!normalizedTime) {
        return res.status(400).json({ success: false, message: 'Valid time is required (HH:mm)' });
      }
      job.time = normalizedTime;
    }

    if (linkUrl !== undefined || seminarId !== undefined) {
      const { resolvedSeminarId, resolvedLinkUrl } = await resolveSeminarLink({
        seminarId: seminarId === undefined ? job.seminarId : seminarId,
        organizationId,
        linkUrl: linkUrl === undefined ? job.linkUrl : linkUrl,
      });
      job.seminarId = resolvedSeminarId;
      job.linkUrl = resolvedLinkUrl;
    }

    if (!job.title || !job.body) {
      return res.status(400).json({ success: false, message: 'title and body are required' });
    }

    await job.save();

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
  normalizeTime,
  normalizeDays,
  DAY_NAMES,
};
