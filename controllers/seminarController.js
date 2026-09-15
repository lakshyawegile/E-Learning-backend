const { Seminar, SeminarRegistration, User, SeminarHomeConfig } = require('../models');
const paginate = require('../utils/pagination');
const { buildNextOccurrenceUTC } = require('../utils/seminarOccurrence');
const logger = require('../utils/logger');

const normalizeDays = (days) => {
  if (!Array.isArray(days)) return [];
  const uniq = Array.from(new Set(days.map((d) => Number(d)).filter((d) => Number.isFinite(d) && d >= 0 && d <= 6)));
  return uniq.sort((a, b) => a - b);
};

const IST_TZ = 'Asia/Kolkata';

const formatMonthNameIST = (d) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: IST_TZ, month: 'long' }).format(d);

const formatDayIST = (d) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: IST_TZ, day: '2-digit' }).format(d);

const formatTimeIST = (d) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: IST_TZ, hour: 'numeric', minute: '2-digit', hour12: true }).format(d);

const getISTDayOfWeek = (date) => {
  // Convert to IST by adding offset (+05:30), then use UTC day to avoid local timezone issues.
  const ist = new Date(date.getTime() + 330 * 60 * 1000);
  return ist.getUTCDay(); // 0=Sun ... 6=Sat in IST context
};

// How long before the start the app should switch to "starting soon".
const STARTING_SOON_MINUTES = 30;

const isSameISTDay = (a, b) => {
  const istA = new Date(a.getTime() + 330 * 60 * 1000);
  const istB = new Date(b.getTime() + 330 * 60 * 1000);
  return (
    istA.getUTCFullYear() === istB.getUTCFullYear() &&
    istA.getUTCMonth() === istB.getUTCMonth() &&
    istA.getUTCDate() === istB.getUTCDate()
  );
};

/**
 * Resolves the home-screen webinar banner. The server picks the state AND the
 * copy so the app can render it as-is — no date maths or branching client-side.
 */
const buildWebinarBanner = ({ now, best, whatsapp_message }) => {
  const { startUTC, endUTC, seminar } = best;
  const is_live = now >= startUTC && now <= endUTC;
  const is_today = isSameISTDay(startUTC, now);
  const startsInMinutes = Math.round((startUTC.getTime() - now.getTime()) / 60000);
  const timeLabel = formatTimeIST(startUTC);

  let status = 'upcoming';
  let headline = `Next seminar on ${formatDayIST(startUTC)} ${formatMonthNameIST(startUTC)}, ${timeLabel}`;
  let ctaLabel = 'View details';

  if (is_live) {
    status = 'live';
    headline = 'Seminar is live now';
    ctaLabel = 'Tap to join';
  } else if (startsInMinutes > 0 && startsInMinutes <= STARTING_SOON_MINUTES) {
    status = 'starting_soon';
    headline = `Seminar starts in ${startsInMinutes} min`;
    ctaLabel = 'Tap to join';
  } else if (is_today) {
    status = 'today';
    headline = `Seminar is today at ${timeLabel}`;
    ctaLabel = 'View details';
  }

  return {
    status,
    headline,
    ctaLabel,
    is_live,
    is_today,
    starts_in_minutes: startsInMinutes,
    startsAt: startUTC.toISOString(),
    endsAt: endUTC.toISOString(),
    // Unchanged from before — the existing home screen still reads these
    day: formatDayIST(startUTC),
    month: formatMonthNameIST(startUTC),
    time: timeLabel,
    whatsapp_message,
    seminarId: String(seminar._id),
    title: seminar.title || '',
    meetingUrl: seminar.meetingUrl || '',
    meetingPasscode: seminar.meetingPasscode || '',
  };
};

const normalizeTimeHHmm = (raw, fallback = '19:00') => {
  const match = String(raw || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return fallback;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

/**
 * Builds the stored schedule from an incoming payload. Accepts either the new
 * per-day `slots` or the legacy daysOfWeek + single time, and always writes
 * BOTH — slots as the source of truth, daysOfWeek/time as a mirror so anything
 * still reading the old fields keeps working.
 */
const normalizeSchedulePayload = (schedule) => {
  const sch = schedule && typeof schedule === 'object' ? schedule : {};
  const defaultDuration = Number(sch.durationMinutes) || 60;

  let slots = [];
  if (Array.isArray(sch.slots) && sch.slots.length) {
    slots = sch.slots
      .map((s) => {
        const dayOfWeek = Number(s?.dayOfWeek);
        if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) return null;
        return {
          dayOfWeek,
          time: normalizeTimeHHmm(s?.time),
          durationMinutes: Number(s?.durationMinutes) || defaultDuration,
        };
      })
      .filter(Boolean);
  } else {
    // Legacy input — one time for every selected day
    const time = normalizeTimeHHmm(sch.time);
    slots = normalizeDays(sch.daysOfWeek).map((dayOfWeek) => ({
      dayOfWeek,
      time,
      durationMinutes: defaultDuration,
    }));
  }

  slots.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.time.localeCompare(b.time));

  return {
    type: 'weekly',
    slots,
    // Mirror of the above, for readers still on the old shape
    daysOfWeek: [...new Set(slots.map((s) => s.dayOfWeek))],
    time: slots.length ? slots[0].time : normalizeTimeHHmm(sch.time),
    durationMinutes: slots.length ? slots[0].durationMinutes : defaultDuration,
    timezone: String(sch.timezone || 'Asia/Kolkata').trim() || 'Asia/Kolkata',
    startDate: sch.startDate ? new Date(sch.startDate) : null,
    endDate: sch.endDate ? new Date(sch.endDate) : null,
  };
};

// ADMIN: POST /api/seminars
const createSeminar = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    const createdBy = req.user?.userId || null;
    if (!organizationId) return res.status(400).json({ message: 'User organization not found' });

    const { title, description, bannerImageUrl, meetingUrl, meetingPasscode, schedule, isActive } =
      req.body || {};

    const doc = await Seminar.create({
      organizationId,
      title: title !== undefined ? String(title).trim() : '',
      description: description !== undefined ? String(description).trim() : '',
      bannerImageUrl: bannerImageUrl !== undefined ? String(bannerImageUrl).trim() : '',
      meetingUrl: meetingUrl !== undefined ? String(meetingUrl).trim() : '',
      meetingPasscode: meetingPasscode !== undefined ? String(meetingPasscode).trim() : '',
      schedule: schedule ? normalizeSchedulePayload(schedule) : undefined,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      createdBy,
    });

    return res.status(201).json({ success: true, data: doc });
  } catch (err) {
    logger.error('createSeminar error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// USER: GET /api/seminars/home
// Returns only next immediate seminar info + achievements
const getSeminarHome = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(400).json({ message: 'User organization not found' });

    const config = await SeminarHomeConfig.findOne({ organizationId, isActive: true }).lean();
    const achievements = Array.isArray(config?.achievements) ? config.achievements : [];
    const whatsapp_message = config?.whatsapp_message || '';

    const now = new Date();
    const seminars = await Seminar.find({ organizationId, isActive: true }).lean();

    let best = null;
    for (const s of seminars) {
      const sch = s.schedule || {};
      if (sch.type !== 'weekly') continue;
      const occ = buildNextOccurrenceUTC({ now, schedule: sch });
      if (!occ) continue;

      // Optional schedule window constraints
      if (sch.startDate && occ.startUTC < new Date(sch.startDate)) continue;
      if (sch.endDate && occ.startUTC > new Date(sch.endDate)) continue;

      if (!best || occ.startUTC < best.startUTC) {
        best = { seminar: s, startUTC: occ.startUTC, endUTC: occ.endUTC };
      }
    }

    const webinar = best
      ? buildWebinarBanner({ now, best, whatsapp_message })
      : {
          status: 'none',
          headline: '',
          ctaLabel: '',
          is_live: false,
          is_today: false,
          starts_in_minutes: null,
          startsAt: null,
          day: '',
          month: '',
          time: '',
          whatsapp_message,
        };

    return res.json({
      success: true,
      data: {
        achievements,
        webinar,
      },
    });
  } catch (err) {
    logger.error('getSeminarHome error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ADMIN: PUT /api/seminars/home-config
const upsertSeminarHomeConfig = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    const updatedBy = req.user?.userId || null;
    if (!organizationId) return res.status(400).json({ message: 'User organization not found' });

    const { achievements, whatsapp_message, isActive } = req.body || {};
    const updates = { updatedBy };
    if (Array.isArray(achievements)) {
      updates.achievements = achievements.map((x) => String(x)).filter(Boolean);
    }
    if (whatsapp_message !== undefined) updates.whatsapp_message = String(whatsapp_message).trim();
    if (isActive !== undefined) updates.isActive = Boolean(isActive);

    const saved = await SeminarHomeConfig.findOneAndUpdate(
      { organizationId },
      { $set: { organizationId, ...updates } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return res.json({
      success: true,
      data: {
        achievements: saved.achievements || [],
        whatsapp_message: saved.whatsapp_message || '',
        isActive: saved.isActive,
      },
    });
  } catch (err) {
    logger.error('upsertSeminarHomeConfig error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// USER: GET /api/seminars
const listSeminars = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(400).json({ message: 'User organization not found' });

    const { page, limit, includeInactive } = req.query;
    const filter = { organizationId };
    if (!includeInactive || includeInactive === 'false') filter.isActive = true;

    const result = await paginate(Seminar, { filter, page, limit, sort: { createdAt: -1 } });
    return res.json(result);
  } catch (err) {
    logger.error('listSeminars error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// USER: GET /api/seminars/:seminarId
const getSeminarById = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(400).json({ message: 'User organization not found' });

    const { seminarId } = req.params;
    const doc = await Seminar.findOne({ _id: seminarId, organizationId }).lean();
    if (!doc) return res.status(404).json({ message: 'Seminar not found' });
    if (!doc.isActive && req.query.includeInactive !== 'true') return res.status(404).json({ message: 'Seminar not found' });
    return res.json({ success: true, data: doc });
  } catch (err) {
    logger.error('getSeminarById error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ADMIN: PUT /api/seminars/:seminarId
const updateSeminar = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(400).json({ message: 'User organization not found' });

    const { seminarId } = req.params;
    const { title, description, bannerImageUrl, meetingUrl, meetingPasscode, schedule, isActive } =
      req.body || {};

    const updates = {};
    if (title !== undefined) updates.title = String(title).trim();
    if (description !== undefined) updates.description = String(description).trim();
    if (bannerImageUrl !== undefined) updates.bannerImageUrl = String(bannerImageUrl).trim();
    if (meetingUrl !== undefined) updates.meetingUrl = String(meetingUrl).trim();
    if (meetingPasscode !== undefined) updates.meetingPasscode = String(meetingPasscode).trim();
    if (isActive !== undefined) updates.isActive = Boolean(isActive);
    if (schedule !== undefined && schedule && typeof schedule === 'object') {
      updates.schedule = normalizeSchedulePayload(schedule);
    }

    const doc = await Seminar.findOneAndUpdate(
      { _id: seminarId, organizationId },
      { $set: updates },
      { new: true, runValidators: true }
    ).lean();
    if (!doc) return res.status(404).json({ message: 'Seminar not found' });
    return res.json({ success: true, data: doc });
  } catch (err) {
    logger.error('updateSeminar error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ADMIN: DELETE /api/seminars/:seminarId
const deleteSeminar = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(400).json({ message: 'User organization not found' });

    const { seminarId } = req.params;
    const deleted = await Seminar.findOneAndDelete({ _id: seminarId, organizationId }).lean();
    if (!deleted) return res.status(404).json({ message: 'Seminar not found' });
    return res.json({ success: true, message: 'Seminar deleted' });
  } catch (err) {
    logger.error('deleteSeminar error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// USER: POST /api/seminars/:seminarId/register
const registerForSeminar = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;
    if (!organizationId) return res.status(400).json({ message: 'User organization not found' });
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const { seminarId } = req.params;
    const seminar = await Seminar.findOne({ _id: seminarId, organizationId, isActive: true }).lean();
    if (!seminar) return res.status(404).json({ message: 'Seminar not found' });

    const user = await User.findById(userId).lean();
    const name = user?.name ? String(user.name).trim() : '';
    const mobile = user?.mobile ? String(user.mobile).trim() : '';
    const email = user?.email ? String(user.email).trim().toLowerCase() : '';
    const interestedIn = user?.interestedIn ? String(user.interestedIn).trim().toLowerCase() : '';

    const reg = await SeminarRegistration.findOneAndUpdate(
      { organizationId, seminarId, userId },
      {
        $set: {
          name,
          mobile,
          email,
          interestedIn: interestedIn === 'import' || interestedIn === 'export' ? interestedIn : '',
          status: 'REGISTERED',
          registeredAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return res.json({ success: true, data: reg });
  } catch (err) {
    logger.error('registerForSeminar error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// USER: GET /api/seminars/me/registrations
const mySeminarRegistrations = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;
    if (!organizationId) return res.status(400).json({ message: 'User organization not found' });
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const regs = await SeminarRegistration.find({ organizationId, userId, status: 'REGISTERED' })
      .sort({ registeredAt: -1 })
      .lean();
    return res.json({ success: true, data: regs });
  } catch (err) {
    logger.error('mySeminarRegistrations error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ADMIN: GET /api/seminars/:seminarId/registrations?page=&limit=
const listRegistrationsForSeminar = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(400).json({ message: 'User organization not found' });

    const { seminarId } = req.params;
    const { page, limit, status } = req.query;

    const filter = { organizationId, seminarId };
    if (status) filter.status = String(status).toUpperCase();

    const result = await paginate(SeminarRegistration, {
      filter,
      page,
      limit,
      sort: { registeredAt: -1 },
    });
    return res.json(result);
  } catch (err) {
    logger.error('listRegistrationsForSeminar error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  createSeminar,
  getSeminarHome,
  upsertSeminarHomeConfig,
  listSeminars,
  getSeminarById,
  updateSeminar,
  deleteSeminar,
  registerForSeminar,
  mySeminarRegistrations,
  listRegistrationsForSeminar,
};

