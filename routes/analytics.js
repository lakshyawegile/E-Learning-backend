const express = require('express');
const { recordClicks, getHeatmap, getScreens, logEvent, getInstallStats, getClicksSummary, getDashboardSummary, getActiveUsersList } = require('../controllers/analyticsController');
const { AnalyticsLogEvent } = require('../models');
const requireOrgAdmin = require('../middlewares/requireOrgAdmin');

const protectedAnalyticsRoutes = express.Router();
const publicAnalyticsRoutes = express.Router();

// POST /api/analytics/clicks
protectedAnalyticsRoutes.post('/clicks', recordClicks);

// POST /api/analytics/log-event
protectedAnalyticsRoutes.post('/log-event', logEvent);

// GET /api/analytics/heatmap
protectedAnalyticsRoutes.get('/heatmap', getHeatmap);

// GET /api/analytics/screens
protectedAnalyticsRoutes.get('/screens', getScreens);

// GET /api/analytics/installs?period=daily|weekly|monthly|yearly&date=YYYY-MM-DD&count=7
protectedAnalyticsRoutes.get('/installs', getInstallStats);

// GET /api/analytics/clicks/summary?screenName=...&sectionKey=&from=&to=
protectedAnalyticsRoutes.get('/clicks/summary', getClicksSummary);

// GET /api/analytics/dashboard-summary?days=30 (admin-only)
protectedAnalyticsRoutes.get('/dashboard-summary', requireOrgAdmin, getDashboardSummary);

// GET /api/analytics/active-users?period=today|week|month&page=&limit= (admin-only)
protectedAnalyticsRoutes.get('/active-users', requireOrgAdmin, getActiveUsersList);

// POST /api/track (public bulk ingestion)
publicAnalyticsRoutes.post('/track', async (req, res) => {
  try {
    const { events, organizationId: topOrgId, userId: topUserId, phone_number: topPhone } = req.body || {};
    if (!Array.isArray(events) || !events.length) {
      return res.status(400).json({ message: 'events array is required' });
    }

    // Minimal validation for performance
    const docs = events.map((e) => {
      const eventTimestamp = new Date(e.event_timestamp);
      const organizationId = e.organizationId ?? topOrgId;
      const userId = e.userId ?? topUserId;
      const phone_number = e.phone_number ?? topPhone ?? '';

      if (!e.event_name || !organizationId || !e.event_timestamp || Number.isNaN(eventTimestamp.getTime())) {
        return null;
      }

      return {
        organizationId,
        userId: userId ?? null,
        event_name: e.event_name,
        parameters: e.parameters && typeof e.parameters === 'object' ? e.parameters : {},
        phone_number,
        event_timestamp: eventTimestamp,
      };
    });

    if (docs.some((d) => d === null)) {
      return res.status(400).json({ message: 'Invalid event payload' });
    }

    await AnalyticsLogEvent.insertMany(docs, { ordered: false });
    return res.status(200).json({ success: true, inserted: docs.length });
  } catch (err) {
    console.error('track bulk insert error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/analytics/track (protected bulk ingestion)
protectedAnalyticsRoutes.post('/track', async (req, res) => {
  try {
    const { events } = req.body || {};
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;

    if (!organizationId || !userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    if (!Array.isArray(events) || !events.length) {
      return res.status(400).json({ message: 'events array is required' });
    }

    const docs = events.map((e) => {
      const eventTimestamp = new Date(e.event_timestamp);
      if (!e.event_name || !e.event_timestamp || Number.isNaN(eventTimestamp.getTime())) {
        return null;
      }

      return {
        organizationId,
        userId,
        event_name: e.event_name,
        parameters: e.parameters && typeof e.parameters === 'object' ? e.parameters : {},
        phone_number: '', // not required for aggregation; keep empty unless you want to store it
        event_timestamp: eventTimestamp,
      };
    });

    if (docs.some((d) => d === null)) {
      return res.status(400).json({ message: 'Invalid event payload' });
    }

    await AnalyticsLogEvent.insertMany(docs, { ordered: false });
    return res.status(200).json({ success: true, inserted: docs.length });
  } catch (err) {
    console.error('protected track bulk insert error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = {
  publicAnalyticsRoutes,
  protectedAnalyticsRoutes,
};
