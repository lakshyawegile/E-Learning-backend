const { JourneyConfig, UserJourneyProgress } = require('../models');
const logger = require('../utils/logger');

const normalizeJourneyType = (v) => String(v || '').trim().toLowerCase();

// GET /api/journey/progress?journeyType=import|export
const getJourneyProgress = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;
    if (!organizationId) return res.status(400).json({ message: 'User organization not found' });
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const journeyType = normalizeJourneyType(req.query.journeyType);
    if (journeyType !== 'import' && journeyType !== 'export') {
      return res.status(400).json({ message: 'Invalid journeyType. Use import or export.' });
    }

    const progress = await UserJourneyProgress.findOne({ organizationId, userId, journeyType }).lean();
    if (!progress) {
      const cfg = await JourneyConfig.findOne({ organizationId, journeyType, isActive: true }).lean();
      return res.json({
        success: true,
        data: {
          journeyType,
          configVersion: cfg?.version ?? 1,
          completedSteps: [],
          lastActiveStep: 1,
          stepResults: [],
        },
      });
    }

    return res.json({
      success: true,
      data: {
        journeyType: progress.journeyType,
        configVersion: progress.configVersion,
        completedSteps: progress.completedSteps || [],
        lastActiveStep: progress.lastActiveStep,
        stepResults: progress.stepResults || [],
      },
    });
  } catch (err) {
    logger.error('getJourneyProgress error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// PUT /api/journey/progress?journeyType=import|export
// Body: { completedSteps?: number[], lastActiveStep?: number, stepResult?: { stepId, score, totalQuestions, correctCount } }
const upsertJourneyProgress = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;
    if (!organizationId) return res.status(400).json({ message: 'User organization not found' });
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const journeyType = normalizeJourneyType(req.query.journeyType);
    if (journeyType !== 'import' && journeyType !== 'export') {
      return res.status(400).json({ message: 'Invalid journeyType. Use import or export.' });
    }

    const { completedSteps, lastActiveStep, stepResult } = req.body || {};

    const toSet = {};
    if (Array.isArray(completedSteps)) {
      const uniq = Array.from(new Set(completedSteps.map((x) => Number(x)).filter((n) => Number.isFinite(n))));
      toSet.completedSteps = uniq.sort((a, b) => a - b);
    }
    if (lastActiveStep !== undefined) {
      const n = Number(lastActiveStep);
      if (Number.isFinite(n) && n > 0) toSet.lastActiveStep = n;
    }

    const cfg = await JourneyConfig.findOne({ organizationId, journeyType, isActive: true }).lean();
    const configVersion = cfg?.version ?? 1;

    const update = { $set: { organizationId, userId, journeyType, configVersion, ...toSet } };

    if (stepResult && typeof stepResult === 'object') {
      const stepId = Number(stepResult.stepId);
      if (Number.isFinite(stepId) && stepId > 0) {
        const score = Number(stepResult.score || 0);
        const totalQuestions = Number(stepResult.totalQuestions || 0);
        const correctCount = Number(stepResult.correctCount || 0);
        update.$push = {
          stepResults: {
            stepId,
            score: Number.isFinite(score) ? score : 0,
            totalQuestions: Number.isFinite(totalQuestions) ? totalQuestions : 0,
            correctCount: Number.isFinite(correctCount) ? correctCount : 0,
            attemptedAt: new Date(),
          },
        };
      }
    }

    const saved = await UserJourneyProgress.findOneAndUpdate(
      { organizationId, userId, journeyType },
      update,
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    ).lean();

    return res.json({
      success: true,
      data: {
        journeyType: saved.journeyType,
        configVersion: saved.configVersion,
        completedSteps: saved.completedSteps || [],
        lastActiveStep: saved.lastActiveStep,
        stepResults: saved.stepResults || [],
      },
    });
  } catch (err) {
    logger.error('upsertJourneyProgress error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = { getJourneyProgress, upsertJourneyProgress };

