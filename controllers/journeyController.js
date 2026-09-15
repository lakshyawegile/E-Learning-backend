const { JourneyConfig } = require('../models');
const logger = require('../utils/logger');

const normalizeJourneyType = (v) => String(v || '').trim().toLowerCase();

// GET /api/journey/config?journeyType=import|export
const getJourneyConfig = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(400).json({ message: 'User organization not found' });

    const journeyType = normalizeJourneyType(req.query.journeyType);
    if (journeyType !== 'import' && journeyType !== 'export') {
      return res.status(400).json({ message: 'Invalid journeyType. Use import or export.' });
    }

    const config = await JourneyConfig.findOne({ organizationId, journeyType, isActive: true }).lean();
    if (!config) {
      return res.json({ success: true, data: { journeyType, version: 1, steps: [] } });
    }

    return res.json({
      success: true,
      data: {
        journeyType: config.journeyType,
        version: config.version,
        steps: config.steps || [],
      },
    });
  } catch (err) {
    logger.error('getJourneyConfig error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// PUT /api/journey/config?journeyType=import|export (admin)
// Body: { version?, steps: [...] , isActive? }
const upsertJourneyConfig = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(400).json({ message: 'User organization not found' });

    const journeyType = normalizeJourneyType(req.query.journeyType);
    if (journeyType !== 'import' && journeyType !== 'export') {
      return res.status(400).json({ message: 'Invalid journeyType. Use import or export.' });
    }

    const { version, steps, isActive } = req.body || {};
    if (!Array.isArray(steps)) {
      return res.status(400).json({ message: 'steps must be an array' });
    }

    const toSet = {
      organizationId,
      journeyType,
      steps,
    };
    if (version !== undefined) toSet.version = Number(version) || 1;
    if (isActive !== undefined) toSet.isActive = Boolean(isActive);

    const saved = await JourneyConfig.findOneAndUpdate(
      { organizationId, journeyType },
      { $set: toSet },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    ).lean();

    return res.json({
      success: true,
      data: {
        journeyType: saved.journeyType,
        version: saved.version,
        steps: saved.steps || [],
        isActive: saved.isActive,
      },
    });
  } catch (err) {
    logger.error('upsertJourneyConfig error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = { getJourneyConfig, upsertJourneyConfig };

