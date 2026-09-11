const { ProfileQuestionConfig } = require('../models');
const { _internals } = require('./profileQuestionsController');

const {
  INPUT_TYPES,
  USER_FIELD_MAPPINGS,
  INTEREST_VALUES,
  KEY_PATTERN,
  SCREEN_KEYS,
} = _internals;

const INCOMPLETE_ACTIONS = ['open_questionnaire', 'none'];
const COMPLETE_ACTIONS = ['whatsapp', 'call', 'internal', 'external_url', 'none'];

const defaultBanners = () => ({
  incompleteBanner: {
    title: 'Complete your profile',
    subtitle: 'Tell us about your business so our team can guide you',
    imageUrl: '',
    ctaLabel: 'Complete now',
    action: 'open_questionnaire',
    actionValue: '',
    isVisible: true,
  },
  completeBanner: {
    title: 'Need help? Call us 24/7',
    subtitle: 'Our export advisors are a message away',
    imageUrl: '',
    ctaLabel: 'Chat on WhatsApp',
    action: 'whatsapp',
    actionValue: '',
    isVisible: true,
  },
});

const normaliseBanner = (input, allowedActions, label) => {
  const banner = input && typeof input === 'object' ? input : {};
  const action = String(banner.action || 'none').trim();

  if (!allowedActions.includes(action)) {
    return { error: `${label}: "${action}" is not a valid action (${allowedActions.join(', ')})` };
  }

  const actionValue = String(banner.actionValue || '').trim();

  if (action === 'internal' && !SCREEN_KEYS.includes(actionValue)) {
    return { error: `${label}: "${actionValue}" is not a known app screen` };
  }
  if (action === 'external_url' && !/^https?:\/\//i.test(actionValue)) {
    return { error: `${label}: a link must start with http:// or https://` };
  }
  if (action === 'call' && !actionValue) {
    return { error: `${label}: a phone number is required for the call action` };
  }

  return {
    value: {
      title: String(banner.title || '').trim(),
      subtitle: String(banner.subtitle || '').trim(),
      imageUrl: String(banner.imageUrl || '').trim(),
      ctaLabel: String(banner.ctaLabel || '').trim(),
      action,
      // whatsapp deliberately allows a blank value — it falls back to SocialLinksConfig
      actionValue: action === 'none' || action === 'open_questionnaire' ? '' : actionValue,
      isVisible: banner.isVisible !== false,
    },
  };
};

const normaliseQuestions = (input) => {
  if (!Array.isArray(input)) return { error: 'questions must be an array' };

  const seenKeys = new Set();
  const usedMappings = new Set();
  const questions = [];

  for (let i = 0; i < input.length; i += 1) {
    const raw = input[i] || {};
    const position = i + 1;

    const key = String(raw.key || '').trim();
    if (!key) return { error: `Question ${position}: key is required` };
    if (!KEY_PATTERN.test(key)) {
      return {
        error: `Question ${position}: key "${key}" must start with a letter and use only letters, numbers and underscores`,
      };
    }
    if (seenKeys.has(key)) return { error: `Duplicate question key "${key}"` };
    seenKeys.add(key);

    const label = String(raw.label || '').trim();
    if (!label) return { error: `Question "${key}": label is required` };

    const inputType = String(raw.inputType || 'text').trim();
    if (!INPUT_TYPES.includes(inputType)) {
      return { error: `Question "${key}": inputType must be one of ${INPUT_TYPES.join(', ')}` };
    }

    const options = Array.isArray(raw.options)
      ? [...new Set(raw.options.map((o) => String(o || '').trim()).filter(Boolean))]
      : [];

    if (inputType !== 'text' && !options.length) {
      return { error: `Question "${key}": a ${inputType} question needs at least one option` };
    }

    const mapsToUserField = String(raw.mapsToUserField || '').trim();
    if (mapsToUserField) {
      if (!USER_FIELD_MAPPINGS.includes(mapsToUserField)) {
        return { error: `Question "${key}": "${mapsToUserField}" is not a mappable user field` };
      }
      if (usedMappings.has(mapsToUserField)) {
        return { error: `Only one question may map to "${mapsToUserField}"` };
      }
      usedMappings.add(mapsToUserField);

      // interestedIn feeds the push-notification audience filter, which matches on
      // exactly import/export/both — anything else would silently target nobody.
      if (mapsToUserField === 'interestedIn') {
        if (inputType !== 'dropdown') {
          return { error: `Question "${key}": the interest question must be a dropdown` };
        }
        const invalid = options.filter((o) => !INTEREST_VALUES.includes(o.toLowerCase()));
        if (invalid.length) {
          return {
            error: `Question "${key}": interest options must be Import, Export or Both (found "${invalid.join('", "')}")`,
          };
        }
      }
    }

    const maxLength = Number.isFinite(Number(raw.maxLength)) ? Number(raw.maxLength) : 200;
    if (maxLength < 1 || maxLength > 2000) {
      return { error: `Question "${key}": maxLength must be between 1 and 2000` };
    }

    questions.push({
      key,
      label,
      helperText: String(raw.helperText || '').trim(),
      inputType,
      options: inputType === 'text' ? [] : options,
      required: raw.required !== false,
      order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : position,
      maxLength,
      mapsToUserField,
      isActive: raw.isActive !== false,
    });
  }

  questions.sort((a, b) => a.order - b.order);
  // Re-sequence so the app always walks 1..n with no gaps
  questions.forEach((q, idx) => {
    q.order = idx + 1;
  });

  return { value: questions };
};

// GET /api/profile-questions/config
const getConfig = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(400).json({ message: 'User organization not found' });

    const config = await ProfileQuestionConfig.findOne({ organizationId }).lean();
    if (!config) {
      return res.json({
        success: true,
        data: { organizationId, version: 0, isActive: true, questions: [], ...defaultBanners() },
      });
    }

    return res.json({ success: true, data: config });
  } catch (err) {
    console.error('getProfileQuestionConfig error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// PUT /api/profile-questions/config — full replace, bumps version
const upsertConfig = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(400).json({ message: 'User organization not found' });

    const fallback = defaultBanners();

    const incomplete = normaliseBanner(
      req.body?.incompleteBanner ?? fallback.incompleteBanner,
      INCOMPLETE_ACTIONS,
      'Incomplete banner'
    );
    if (incomplete.error) return res.status(400).json({ message: incomplete.error });

    const complete = normaliseBanner(
      req.body?.completeBanner ?? fallback.completeBanner,
      COMPLETE_ACTIONS,
      'Complete banner'
    );
    if (complete.error) return res.status(400).json({ message: complete.error });

    const questions = normaliseQuestions(req.body?.questions ?? []);
    if (questions.error) return res.status(400).json({ message: questions.error });

    const existing = await ProfileQuestionConfig.findOne({ organizationId }).select('version').lean();

    const saved = await ProfileQuestionConfig.findOneAndUpdate(
      { organizationId },
      {
        $set: {
          organizationId,
          isActive: req.body?.isActive !== false,
          incompleteBanner: incomplete.value,
          completeBanner: complete.value,
          questions: questions.value,
          version: (existing?.version ?? 0) + 1,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return res.json({ success: true, data: saved });
  } catch (err) {
    console.error('upsertProfileQuestionConfig error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = { getConfig, upsertConfig };
