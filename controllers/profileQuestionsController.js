const { ProfileQuestionConfig, UserProfileAnswers, SocialLinksConfig, User } = require('../models');
const { PROFILE_QUESTION_SCREENS, SCREEN_KEYS } = require('../constants/profileQuestionScreens');
const { flattenProfileAnswer } = require('../utils/profileAnswerFormat');

const INPUT_TYPES = ['text', 'dropdown', 'both'];
const BANNER_ACTIONS = ['open_questionnaire', 'whatsapp', 'call', 'internal', 'external_url', 'none'];
const USER_FIELD_MAPPINGS = ['name', 'interestedIn'];
const INTEREST_VALUES = ['import', 'export', 'both'];
const KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;

const activeQuestions = (config) =>
  (config?.questions || [])
    .filter((q) => q.isActive !== false)
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

const hasValue = (answer) =>
  Boolean(String(answer?.optionValue || '').trim() || String(answer?.textValue || '').trim());

const answerMap = (answersDoc) => {
  const map = new Map();
  for (const a of answersDoc?.answers || []) {
    if (hasValue(a)) map.set(a.questionKey, a);
  }
  return map;
};

// Progress is measured against required questions only. Optional questions are still
// collected and still shown, they just never hold the banner hostage.
const computeProgress = (config, answersDoc) => {
  const questions = activeQuestions(config);
  const answered = answerMap(answersDoc);

  const required = questions.filter((q) => q.required !== false);
  const answeredRequired = required.filter((q) => answered.has(q.key)).length;

  const completionPercentage = required.length
    ? Math.round((answeredRequired / required.length) * 100)
    : 100;
  const isComplete = answeredRequired === required.length;

  const next = questions.find((q) => !answered.has(q.key));

  return {
    questions,
    answered,
    completionPercentage,
    isComplete,
    totalRequired: required.length,
    answeredRequired,
    nextQuestionKey: next ? next.key : null,
  };
};

const resolveBanner = async (config, isComplete, organizationId) => {
  const state = isComplete ? 'complete' : 'incomplete';
  const source = (isComplete ? config?.completeBanner : config?.incompleteBanner) || {};

  let actionValue = String(source.actionValue || '').trim();
  // A blank WhatsApp number means "use the org's configured one" so it isn't
  // maintained in two places.
  if (source.action === 'whatsapp' && !actionValue) {
    const links = await SocialLinksConfig.findOne({ organizationId, isActive: true })
      .select('whatsapp_number')
      .lean();
    actionValue = String(links?.whatsapp_number || '').trim();
  }

  return {
    state,
    title: source.title || '',
    subtitle: source.subtitle || '',
    imageUrl: source.imageUrl || '',
    ctaLabel: source.ctaLabel || '',
    action: source.action || 'none',
    actionValue,
    isVisible: source.isVisible !== false,
  };
};

const buildAppResponse = async (config, answersDoc, organizationId) => {
  const progress = computeProgress(config, answersDoc);
  const banner = await resolveBanner(config, progress.isComplete, organizationId);

  const answers = {};
  for (const [key, a] of progress.answered.entries()) {
    answers[key] = {
      optionValue: a.optionValue || '',
      textValue: a.textValue || '',
      value: flattenProfileAnswer(a),
    };
  }

  return {
    isComplete: progress.isComplete,
    completionPercentage: progress.completionPercentage,
    configVersion: config?.version ?? 0,
    banner,
    questions: progress.questions.map((q) => ({
      key: q.key,
      label: q.label,
      helperText: q.helperText || '',
      inputType: q.inputType,
      options: q.inputType === 'text' ? [] : q.options || [],
      required: q.required !== false,
      order: q.order ?? 0,
      maxLength: q.maxLength ?? 200,
    })),
    answers,
    answeredKeys: [...progress.answered.keys()],
    nextQuestionKey: progress.nextQuestionKey,
    totalRequired: progress.totalRequired,
    answeredRequired: progress.answeredRequired,
  };
};

// No config seeded yet — return a hidden banner and no questions so the app simply
// renders nothing instead of erroring.
const emptyAppResponse = () => ({
  isComplete: false,
  completionPercentage: 0,
  configVersion: 0,
  banner: {
    state: 'incomplete',
    title: '',
    subtitle: '',
    imageUrl: '',
    ctaLabel: '',
    action: 'none',
    actionValue: '',
    isVisible: false,
  },
  questions: [],
  answers: {},
  answeredKeys: [],
  nextQuestionKey: null,
  totalRequired: 0,
  answeredRequired: 0,
});

// GET /api/profile-questions
const getProfileQuestions = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const organizationId = req.user?.organizationId;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    if (!organizationId) return res.status(400).json({ message: 'User organization not found' });

    const config = await ProfileQuestionConfig.findOne({ organizationId, isActive: true }).lean();
    if (!config) return res.json({ success: true, data: emptyAppResponse() });

    const answersDoc = await UserProfileAnswers.findOne({ organizationId, userId }).lean();
    const data = await buildAppResponse(config, answersDoc, organizationId);

    return res.json({ success: true, data });
  } catch (err) {
    console.error('getProfileQuestions error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

const validateSubmittedAnswer = (question, incoming) => {
  const optionValue = String(incoming.optionValue ?? '').trim();
  const textValue = String(incoming.textValue ?? '').trim();
  const maxLength = question.maxLength ?? 200;
  const options = question.options || [];

  if (question.inputType === 'text') {
    if (!textValue) return { error: `"${question.label}" needs an answer` };
    if (textValue.length > maxLength) return { error: `"${question.label}" is too long` };
    return { value: { optionValue: '', textValue } };
  }

  if (question.inputType === 'dropdown') {
    if (!optionValue) return { error: `"${question.label}" needs a selection` };
    if (!options.includes(optionValue)) {
      return { error: `"${optionValue}" is not an option for "${question.label}"` };
    }
    return { value: { optionValue, textValue: '' } };
  }

  // 'both' — pick an option, type a value, or do both
  if (!optionValue && !textValue) return { error: `"${question.label}" needs an answer` };
  if (optionValue && !options.includes(optionValue)) {
    return { error: `"${optionValue}" is not an option for "${question.label}"` };
  }
  if (textValue.length > maxLength) return { error: `"${question.label}" is too long` };
  return { value: { optionValue, textValue } };
};

// POST /api/profile-questions/answers
// Accepts one answer or many, so the app can save after each step of the popup.
// A user who drops out at question 4 keeps answers 1-3.
const submitAnswers = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const organizationId = req.user?.organizationId;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    if (!organizationId) return res.status(400).json({ message: 'User organization not found' });

    const incoming = Array.isArray(req.body?.answers)
      ? req.body.answers
      : req.body?.questionKey
        ? [req.body]
        : null;

    if (!incoming || !incoming.length) {
      return res.status(400).json({ message: 'answers is required' });
    }

    const config = await ProfileQuestionConfig.findOne({ organizationId, isActive: true }).lean();
    if (!config) return res.status(404).json({ message: 'Profile questions are not configured' });

    const questionsByKey = new Map(activeQuestions(config).map((q) => [q.key, q]));

    const accepted = [];
    const userUpdates = {};
    const seen = new Set();

    for (const item of incoming) {
      const questionKey = String(item?.questionKey || '').trim();
      if (!questionKey) return res.status(400).json({ message: 'questionKey is required' });
      if (seen.has(questionKey)) {
        return res.status(400).json({ message: `Duplicate answer for "${questionKey}"` });
      }
      seen.add(questionKey);

      const question = questionsByKey.get(questionKey);
      if (!question) {
        return res.status(400).json({ message: `Unknown question "${questionKey}"` });
      }

      const { error, value } = validateSubmittedAnswer(question, item);
      if (error) return res.status(400).json({ message: error });

      accepted.push({
        questionKey,
        inputType: question.inputType,
        optionValue: value.optionValue,
        textValue: value.textValue,
        answeredAt: new Date(),
      });

      // Mirror onto the User doc so existing features keep reading a single source
      if (question.mapsToUserField === 'name') {
        const name = value.textValue || value.optionValue;
        if (name) userUpdates.name = name;
      } else if (question.mapsToUserField === 'interestedIn') {
        const interest = (value.optionValue || value.textValue).toLowerCase();
        if (INTEREST_VALUES.includes(interest)) userUpdates.interestedIn = interest;
      }
    }

    const existing = await UserProfileAnswers.findOne({ organizationId, userId });
    const merged = new Map((existing?.answers || []).map((a) => [a.questionKey, a.toObject ? a.toObject() : a]));
    for (const a of accepted) merged.set(a.questionKey, a);

    const answersDoc = {
      organizationId,
      userId,
      configVersion: config.version ?? 1,
      answers: [...merged.values()],
    };

    const progress = computeProgress(config, answersDoc);
    answersDoc.completionPercentage = progress.completionPercentage;
    answersDoc.isComplete = progress.isComplete;
    // Keep the original completion timestamp if they were already done
    answersDoc.completedAt = progress.isComplete
      ? existing?.completedAt || new Date()
      : null;

    const saved = await UserProfileAnswers.findOneAndUpdate(
      { organizationId, userId },
      { $set: answersDoc },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    if (Object.keys(userUpdates).length) {
      await User.updateOne({ _id: userId }, { $set: userUpdates });
    }

    const data = await buildAppResponse(config, saved, organizationId);
    return res.json({ success: true, data });
  } catch (err) {
    console.error('submitAnswers error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/profile-questions/screen-catalog
const getScreenCatalog = (req, res) => {
  return res.json({ success: true, data: PROFILE_QUESTION_SCREENS });
};

module.exports = {
  getProfileQuestions,
  submitAnswers,
  getScreenCatalog,
  // shared with the admin controller
  _internals: {
    INPUT_TYPES,
    BANNER_ACTIONS,
    USER_FIELD_MAPPINGS,
    INTEREST_VALUES,
    KEY_PATTERN,
    SCREEN_KEYS,
    activeQuestions,
    computeProgress,
  },
};
