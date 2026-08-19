const { AnalyticsClick, AnalyticsLogEvent, AnalyticsInstall } = require('../analytics');
const { DailyAnalytics, User } = require('../models');
const { distinctUserIdsWithActivePremium } = require('../utils/distinctUserIdsWithActivePremium');

const GRID_SIZE_DEFAULT = 10;

// POST /api/analytics/clicks
const recordClicks = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId || req.body.organizationId;
    if (!organizationId) {
      return res.status(400).json({ message: 'organizationId required' });
    }

    const userId = req.user?.userId || req.body.userId || null;
    const events = req.body.events
      ? req.body.events
      : req.body.screenName != null
        ? [req.body]
        : [];

    if (!events.length) {
      return res.status(400).json({ message: 'Provide events array or single event with screenName, sectionKey, xPercent, yPercent' });
    }

    const docs = events.map((e) => ({
      organizationId,
      userId: e.userId || userId,
      screenName: e.screenName,
      sectionKey: e.sectionKey != null ? String(e.sectionKey) : '',
      xPercent: Number(e.xPercent),
      yPercent: Number(e.yPercent),
      viewportWidth: e.viewportWidth != null ? Number(e.viewportWidth) : null,
      viewportHeight: e.viewportHeight != null ? Number(e.viewportHeight) : null,
    }));

    const invalid = docs.find((d) => d.screenName === undefined || d.xPercent === undefined || d.yPercent === undefined);
    if (invalid) {
      return res.status(400).json({ message: 'Each event must have screenName, xPercent, yPercent' });
    }

    await AnalyticsClick.insertMany(docs);
    return res.status(201).json({ message: 'Clicks recorded', count: docs.length });
  } catch (err) {
    console.error('recordClicks error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/analytics/heatmap
const getHeatmap = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId || req.query.organizationId;
    const { screenName, sectionKey, from, to, gridSize: qsGrid } = req.query;

    if (!organizationId || !screenName) {
      return res.status(400).json({ message: 'organizationId and screenName required' });
    }

    const gridSize = Math.min(20, Math.max(5, parseInt(qsGrid, 10) || GRID_SIZE_DEFAULT));
    const filter = { organizationId, screenName };
    if (sectionKey != null && sectionKey !== '') filter.sectionKey = sectionKey;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    const clicks = await AnalyticsClick.find(filter, { xPercent: 1, yPercent: 1 }).lean();
    const grid = Array.from({ length: gridSize }, () => Array(gridSize).fill(0));

    for (const c of clicks) {
      const x = Math.min(gridSize - 1, Math.max(0, Math.floor((c.xPercent / 100) * gridSize)));
      const y = Math.min(gridSize - 1, Math.max(0, Math.floor((c.yPercent / 100) * gridSize)));
      grid[y][x] += 1;
    }

    return res.json({
      screenName,
      sectionKey: sectionKey || '',
      grid,
      gridSize,
      totalClicks: clicks.length,
    });
  } catch (err) {
    console.error('getHeatmap error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/analytics/screens
const getScreens = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId || req.query.organizationId;
    if (!organizationId) {
      return res.status(400).json({ message: 'organizationId required' });
    }

    const list = await AnalyticsClick.aggregate([
      { $match: { organizationId } },
      { $group: { _id: { screenName: '$screenName', sectionKey: '$sectionKey' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $project: { screenName: '$_id.screenName', sectionKey: '$_id.sectionKey', count: 1, _id: 0 } },
    ]);

    return res.json(list);
  } catch (err) {
    console.error('getScreens error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatUTCDate(d) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function formatUTCYearMonth(d) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

function getMondayStartUTC(d) {
  // getUTCDay(): Sun=0, Mon=1 ... Sat=6
  const day = d.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  const ms = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return new Date(ms - diffToMonday * 24 * 60 * 60 * 1000);
}

// GET /api/analytics/installs?period=daily|weekly|monthly|yearly&date=YYYY-MM-DD&count=7
const getInstallStats = async (req, res) => {
  try {
    // AnalyticsInstall doesn't store organizationId as a top-level field.
    // So we aggregate installs globally (date-range only).
    const period = (req.query.period || 'daily').toLowerCase();
    const dateStr = req.query.date;
    const count = Math.max(1, Math.min(60, parseInt(req.query.count, 10) || 7));

    if (!dateStr) return res.status(400).json({ message: 'date is required' });
    const baseDate = new Date(dateStr);
    if (Number.isNaN(baseDate.getTime())) return res.status(400).json({ message: 'Invalid date' });

    let rangeStart;
    let rangeEnd;
    const labels = [];

    if (period === 'daily') {
      rangeEnd = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), baseDate.getUTCDate() + 1));
      rangeStart = new Date(rangeEnd.getTime() - (count - 1) * 24 * 60 * 60 * 1000);
      for (let i = 0; i < count; i++) {
        const d = new Date(rangeStart.getTime() + i * 24 * 60 * 60 * 1000);
        labels.push(formatUTCDate(d));
      }
    } else if (period === 'weekly') {
      const baseWeekStart = getMondayStartUTC(baseDate);
      rangeEnd = new Date(baseWeekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      rangeStart = new Date(rangeEnd.getTime() - (count - 1) * 7 * 24 * 60 * 60 * 1000);
      for (let i = 0; i < count; i++) {
        const d = new Date(rangeStart.getTime() + i * 7 * 24 * 60 * 60 * 1000);
        labels.push(formatUTCDate(d));
      }
    } else if (period === 'monthly') {
      const baseMonthStart = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), 1));
      const baseNextMonthStart = new Date(Date.UTC(baseMonthStart.getUTCFullYear(), baseMonthStart.getUTCMonth() + 1, 1));
      rangeEnd = baseNextMonthStart;
      rangeStart = new Date(rangeEnd.getTime());
      rangeStart.setUTCMonth(rangeStart.getUTCMonth() - (count - 1));
      for (let i = 0; i < count; i++) {
        const d = new Date(Date.UTC(baseMonthStart.getUTCFullYear(), baseMonthStart.getUTCMonth() - (count - 1) + i, 1));
        labels.push(formatUTCYearMonth(d));
      }
    } else if (period === 'yearly') {
      const year = baseDate.getUTCFullYear();
      rangeEnd = new Date(Date.UTC(year + 1, 0, 1));
      rangeStart = new Date(Date.UTC(year - (count - 1), 0, 1));
      for (let y = year - (count - 1); y <= year; y++) labels.push(String(y));
    } else {
      return res.status(400).json({ message: 'Invalid period. Use daily|weekly|monthly|yearly' });
    }

    const match = {
      timestamp: { $gte: rangeStart, $lt: rangeEnd },
    };

    const pipeline = [
      { $match: match },
    ];

    if (period === 'daily') {
      pipeline.push({
        $project: { label: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp', timezone: 'UTC' } } },
      });
      pipeline.push({ $group: { _id: '$label', count: { $sum: 1 } } });
    } else if (period === 'weekly') {
      pipeline.push({
        $project: {
          weekStart: {
            $dateSubtract: {
              startDate: '$timestamp',
              unit: 'day',
              amount: {
                $mod: [{ $add: [{ $dayOfWeek: '$timestamp' }, 5] }, 7],
              },
            },
          },
        },
      });
      pipeline.push({
        $project: { label: { $dateToString: { format: '%Y-%m-%d', date: '$weekStart', timezone: 'UTC' } } },
      });
      pipeline.push({ $group: { _id: '$label', count: { $sum: 1 } } });
    } else if (period === 'monthly') {
      pipeline.push({
        $project: { label: { $dateToString: { format: '%Y-%m', date: '$timestamp', timezone: 'UTC' } } },
      });
      pipeline.push({ $group: { _id: '$label', count: { $sum: 1 } } });
    } else {
      pipeline.push({
        $project: { label: { $dateToString: { format: '%Y', date: '$timestamp', timezone: 'UTC' } } },
      });
      pipeline.push({ $group: { _id: '$label', count: { $sum: 1 } } });
    }

    const agg = await AnalyticsInstall.aggregate(pipeline);
    const countMap = new Map(agg.map((x) => [x._id, x.count]));

    const data = labels.map((label) => ({
      label,
      count: countMap.get(label) || 0,
    }));

    return res.json({
      period,
      date: dateStr,
      count,
      data,
    });
  } catch (err) {
    console.error('getInstallStats error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/analytics/clicks/summary?screenName=...&sectionKey=&from=&to=
const getClicksSummary = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId || req.query.organizationId;
    if (!organizationId) {
      return res.status(400).json({ message: 'organizationId required' });
    }
    const { screenName, sectionKey, from, to } = req.query;
    if (!screenName) {
      return res.status(400).json({ message: 'screenName is required' });
    }

    const filter = { organizationId, screenName };
    if (sectionKey != null && sectionKey !== '') filter.sectionKey = String(sectionKey);
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    const agg = await AnalyticsClick.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalClicks: { $sum: 1 },
          uniqueUsersSet: { $addToSet: '$userId' },
        },
      },
      {
        $project: {
          _id: 0,
          totalClicks: 1,
          uniqueUsersCount: {
            $size: {
              $filter: {
                input: '$uniqueUsersSet',
                as: 'u',
                cond: { $ne: ['$$u', null] },
              },
            },
          },
        },
      },
    ]);

    const row = agg[0] || { totalClicks: 0, uniqueUsersCount: 0 };
    return res.json({ screenName, sectionKey: sectionKey || '', ...row });
  } catch (err) {
    console.error('getClicksSummary error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// POST /api/analytics/log-event
const logEvent = async (req, res) => {
  try {
    const { event_name, parameters, phone_number, timestamp } = req.body;

    if (!event_name || typeof event_name !== 'string' || !event_name.trim()) {
      return res.status(400).json({ success: false, message: 'event_name is required and must be a non-empty string' });
    }

    const eventTimestamp = timestamp ? new Date(timestamp) : new Date();
    if (Number.isNaN(eventTimestamp.getTime())) {
      return res.status(400).json({ success: false, message: 'timestamp must be a valid ISO 8601 date string' });
    }

    const doc = {
      organizationId: req.user?.organizationId || null,
      userId: req.user?.userId || null,
      event_name: event_name.trim(),
      parameters: parameters && typeof parameters === 'object' ? parameters : {},
      phone_number: phone_number != null ? String(phone_number).trim() : '',
      event_timestamp: eventTimestamp,
    };

    await AnalyticsLogEvent.create(doc);
    return res.status(201).json({ success: true });
  } catch (err) {
    console.error('logEvent error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/analytics/log-install
const logInstall = async (req, res) => {
  try {
    const { timestamp, parameters } = req.body || {};

    if (!timestamp) {
      return res.status(400).json({ success: false, message: 'timestamp is required' });
    }
    const ts = new Date(timestamp);
    if (Number.isNaN(ts.getTime())) {
      return res.status(400).json({ success: false, message: 'timestamp must be a valid ISO 8601 date string' });
    }

    if (!parameters || typeof parameters !== 'object') {
      return res.status(400).json({ success: false, message: 'parameters is required and must be an object' });
    }

    await AnalyticsInstall.create({
      timestamp: ts,
      parameters,
    });

    return res.status(201).json({ success: true });
  } catch (err) {
    console.error('logInstall error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /api/analytics/dashboard-summary?days=30|all
const getDashboardSummary = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    // 'all' = lifetime (since the app/account was created) — no lower bound on the range.
    // Trend charts switch to monthly buckets in this mode so "all time" doesn't render
    // thousands of daily points for an app that's been running for years.
    const isAllTime = req.query.days === 'all';
    const days = isAllTime ? null : Math.max(1, Math.min(90, parseInt(req.query.days, 10) || 30));

    const now = new Date();
    const rangeStart = isAllTime ? new Date(0) : new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const seriesDateFormat = isAllTime ? '%Y-%m' : '%Y-%m-%d';

    const userFilter = { role: 'USER' };
    if (organizationId) userFilter.organizationId = organizationId;

    const [
      totalUsers,
      newUsersInRange,
      totalDownloads,
      downloadsInRange,
      downloadsToday,
      downloadsWeek,
      downloadsMonth,
      activeUsersTodayIds,
      activeUsersWeekIds,
      activeUsersMonthIds,
      activeUsersInRangeIds,
      errorsInRange,
      downloadsSeries,
      activeUsersSeries,
      loginsSeries,
      appErrorsSeries,
    ] = await Promise.all([
      User.countDocuments(userFilter),
      User.countDocuments({ ...userFilter, createdAt: { $gte: rangeStart } }),
      AnalyticsInstall.countDocuments({}),
      AnalyticsInstall.countDocuments({ timestamp: { $gte: rangeStart } }),
      AnalyticsInstall.countDocuments({ timestamp: { $gte: todayStart } }),
      AnalyticsInstall.countDocuments({ timestamp: { $gte: weekStart } }),
      AnalyticsInstall.countDocuments({ timestamp: { $gte: monthStart } }),
      AnalyticsLogEvent.distinct('userId', { event_timestamp: { $gte: todayStart }, userId: { $ne: null } }),
      AnalyticsLogEvent.distinct('userId', { event_timestamp: { $gte: weekStart }, userId: { $ne: null } }),
      AnalyticsLogEvent.distinct('userId', { event_timestamp: { $gte: monthStart }, userId: { $ne: null } }),
      AnalyticsLogEvent.distinct('userId', { event_timestamp: { $gte: rangeStart }, userId: { $ne: null } }),
      AnalyticsLogEvent.countDocuments({ event_name: 'app_error', event_timestamp: { $gte: rangeStart } }),
      AnalyticsInstall.aggregate([
        { $match: { timestamp: { $gte: rangeStart } } },
        { $project: { date: { $dateToString: { format: seriesDateFormat, date: '$timestamp', timezone: 'UTC' } } } },
        { $group: { _id: '$date', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      AnalyticsLogEvent.aggregate([
        { $match: { event_timestamp: { $gte: rangeStart } } },
        {
          $project: {
            date: { $dateToString: { format: seriesDateFormat, date: '$event_timestamp', timezone: 'UTC' } },
            userId: 1,
          },
        },
        { $group: { _id: '$date', users: { $addToSet: '$userId' } } },
        { $project: { _id: 0, date: '$_id', count: { $size: { $filter: { input: '$users', as: 'u', cond: { $ne: ['$$u', null] } } } } } },
        { $sort: { date: 1 } },
      ]),
      DailyAnalytics.aggregate([
        { $match: { event_name: 'login', date: { $gte: rangeStart.toISOString().slice(0, 10) } } },
        // DailyAnalytics.date is already a "YYYY-MM-DD" string; for all-time, re-bucket to
        // "YYYY-MM" via substring instead of re-deriving from a raw timestamp field.
        { $project: { bucket: isAllTime ? { $substrCP: ['$date', 0, 7] } : '$date', total_count: 1 } },
        { $group: { _id: '$bucket', count: { $sum: '$total_count' } } },
        { $sort: { _id: 1 } },
      ]),
      DailyAnalytics.aggregate([
        { $match: { event_name: 'app_error', date: { $gte: rangeStart.toISOString().slice(0, 10) } } },
        { $project: { bucket: isAllTime ? { $substrCP: ['$date', 0, 7] } : '$date', total_count: 1 } },
        { $group: { _id: '$bucket', count: { $sum: '$total_count' } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const toSeries = (rows) => rows.map((r) => ({ date: r._id || r.date, count: r.count }));

    return res.json({
      success: true,
      days: isAllTime ? 'all' : days,
      seriesGranularity: isAllTime ? 'month' : 'day',
      from: rangeStart.toISOString(),
      to: now.toISOString(),
      totals: {
        totalUsers,
        newUsersInRange,
        totalDownloads,
        downloadsInRange,
        downloadsToday,
        downloadsWeek,
        downloadsMonth,
        activeUsersToday: activeUsersTodayIds.length,
        activeUsersWeek: activeUsersWeekIds.length,
        activeUsersMonth: activeUsersMonthIds.length,
        activeUsersInRange: activeUsersInRangeIds.length,
        errorsInRange,
      },
      series: {
        downloads: toSeries(downloadsSeries),
        activeUsers: activeUsersSeries,
        logins: toSeries(loginsSeries),
        appErrors: toSeries(appErrorsSeries),
      },
    });
  } catch (err) {
    console.error('getDashboardSummary error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /api/analytics/active-users?period=today|week|month|year|all&page=1&limit=20
const getActiveUsersList = async (req, res) => {
  try {
    const period = ['today', 'week', 'month', 'year', 'all'].includes(req.query.period) ? req.query.period : 'today';
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));

    const now = new Date();
    let rangeStart;
    if (period === 'today') {
      rangeStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    } else if (period === 'week') {
      rangeStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === 'month') {
      rangeStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (period === 'year') {
      rangeStart = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    } else {
      // 'all' — lifetime, since the app/account was created.
      rangeStart = new Date(0);
    }

    const activeUsers = await AnalyticsLogEvent.aggregate([
      { $match: { event_timestamp: { $gte: rangeStart }, userId: { $ne: null } } },
      { $group: { _id: '$userId', lastActiveAt: { $max: '$event_timestamp' }, eventCount: { $sum: 1 } } },
      { $sort: { lastActiveAt: -1 } },
    ]);

    const total = activeUsers.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const pageSlice = activeUsers.slice((page - 1) * limit, (page - 1) * limit + limit);

    const userIds = pageSlice.map((r) => r._id);
    const [users, premiumSet] = await Promise.all([
      User.find({ _id: { $in: userIds } }).select('name mobile email createdAt').lean(),
      distinctUserIdsWithActivePremium(userIds),
    ]);
    const userMap = new Map(users.map((u) => [String(u._id), u]));

    const data = pageSlice.map((r) => {
      const u = userMap.get(String(r._id)) || {};
      return {
        userId: r._id,
        name: u.name || '',
        mobile: u.mobile || '',
        email: u.email || '',
        lastActiveAt: r.lastActiveAt,
        eventCount: r.eventCount,
        isPaid: premiumSet.has(String(r._id)),
      };
    });

    return res.json({
      success: true,
      period,
      from: rangeStart.toISOString(),
      to: now.toISOString(),
      meta: { page, limit, total, totalPages },
      data,
    });
  } catch (err) {
    console.error('getActiveUsersList error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Event name convention used by the app for page-view/CTA-click tracking —
// logged via the existing POST /api/analytics/log-event with these event_name values.
const PAGE_ENGAGEMENT_EVENTS = {
  premium: { view: 'premium_page_view', click: 'premium_cta_click' },
  oneOnOne: { view: 'one_on_one_page_view', click: 'one_on_one_cta_click' },
};

async function countAndUnique(eventName, rangeStart) {
  const match = { event_name: eventName, event_timestamp: { $gte: rangeStart } };
  const [count, uniqueUserIds] = await Promise.all([
    AnalyticsLogEvent.countDocuments(match),
    AnalyticsLogEvent.distinct('userId', { ...match, userId: { $ne: null } }),
  ]);
  return { count, uniqueUsers: uniqueUserIds.length };
}

// GET /api/analytics/page-engagement?days=30 (admin-only)
const getPageEngagementSummary = async (req, res) => {
  try {
    const days = Math.max(1, Math.min(365, parseInt(req.query.days, 10) || 30));
    const rangeStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [premiumViews, premiumClicks, oneOnOneViews, oneOnOneClicks] = await Promise.all([
      countAndUnique(PAGE_ENGAGEMENT_EVENTS.premium.view, rangeStart),
      countAndUnique(PAGE_ENGAGEMENT_EVENTS.premium.click, rangeStart),
      countAndUnique(PAGE_ENGAGEMENT_EVENTS.oneOnOne.view, rangeStart),
      countAndUnique(PAGE_ENGAGEMENT_EVENTS.oneOnOne.click, rangeStart),
    ]);

    return res.json({
      success: true,
      days,
      premium: {
        views: premiumViews.count,
        uniqueViewers: premiumViews.uniqueUsers,
        ctaClicks: premiumClicks.count,
        uniqueClickers: premiumClicks.uniqueUsers,
      },
      oneOnOne: {
        views: oneOnOneViews.count,
        uniqueViewers: oneOnOneViews.uniqueUsers,
        ctaClicks: oneOnOneClicks.count,
        uniqueClickers: oneOnOneClicks.uniqueUsers,
      },
    });
  } catch (err) {
    console.error('getPageEngagementSummary error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = {
  recordClicks,
  getHeatmap,
  getScreens,
  logEvent,
  logInstall,
  getInstallStats,
  getClicksSummary,
  getDashboardSummary,
  getActiveUsersList,
  getPageEngagementSummary,
  PAGE_ENGAGEMENT_EVENTS,
};
