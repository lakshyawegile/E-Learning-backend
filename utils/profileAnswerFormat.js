// Flattens one stored answer into a single display string for admin lists and CSV
// exports. A 'both' answer that has an option *and* free text keeps both halves,
// e.g. "Other — Handicrafts".
const flattenProfileAnswer = (answer) =>
  [String(answer?.optionValue || '').trim(), String(answer?.textValue || '').trim()]
    .filter(Boolean)
    .join(' — ');

// userId -> { answers: { questionKey: 'value' }, completionPercentage, isComplete }
const buildProfileAnswersMap = (docs) => {
  const map = new Map();
  for (const doc of docs || []) {
    const answers = {};
    for (const a of doc.answers || []) {
      const value = flattenProfileAnswer(a);
      if (value) answers[a.questionKey] = value;
    }
    map.set(String(doc.userId), {
      answers,
      completionPercentage: doc.completionPercentage ?? 0,
      isComplete: Boolean(doc.isComplete),
    });
  }
  return map;
};

module.exports = { flattenProfileAnswer, buildProfileAnswersMap };
