const { QuizTopic, QuizQuestion, QuizAttempt } = require('../models');
const paginate = require('../utils/pagination');
const logger = require('../utils/logger');

// POST /api/quizzes/topics
const createTopic = async (req, res) => {
  try {
    const { organizationId, title, description, isActive, createdBy } = req.body;
    if (!organizationId || !title || !createdBy) {
      return res.status(400).json({ message: 'organizationId, title, and createdBy are required' });
    }
    const topic = await QuizTopic.create({ organizationId, title, description, isActive, createdBy });
    return res.status(201).json(topic);
  } catch (err) {
    logger.error('createTopic error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// POST /api/quizzes/topics/:topicId/questions
const addQuestion = async (req, res) => {
  try {
    const { topicId } = req.params;
    const { prompt, options, correctOptionIndex, order, isActive } = req.body;
    if (!prompt || !options || options.length < 4 || correctOptionIndex === undefined) {
      return res.status(400).json({ message: 'prompt, >=4 options, and correctOptionIndex are required' });
    }
    if (correctOptionIndex < 0 || correctOptionIndex >= options.length) {
      return res.status(400).json({ message: 'correctOptionIndex must point to a valid option' });
    }

    const question = await QuizQuestion.create({
      topicId,
      prompt,
      options,
      correctOptionIndex,
      order,
      isActive: isActive !== undefined ? isActive : true,
    });
    return res.status(201).json(question);
  } catch (err) {
    logger.error('addQuestion error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/quizzes/topics
const listTopics = async (req, res) => {
  try {
    const { page, limit, includeInactive, userId } = req.query;
    const filter = {};
    if (!includeInactive || includeInactive === 'false') {
      filter.isActive = true;
    }
    const result = await paginate(QuizTopic, {
      filter,
      page,
      limit,
      sort: { createdAt: -1 },
    });

    // Decorate with attempt flag and counts when userId is provided (app use-case)
    if (userId && result.data?.length) {
      const topicIds = result.data.map((t) => t._id);
      const [attempts, totalCounts] = await Promise.all([
        QuizAttempt.find({ userId, topicId: { $in: topicIds } }, { topicId: 1, answers: 1 }).lean(),
        QuizQuestion.aggregate([
          { $match: { topicId: { $in: topicIds } } },
          { $group: { _id: '$topicId', totalQuestions: { $sum: 1 } } },
        ]),
      ]);

      const attemptedMap = new Map(
        attempts.map((a) => [
          String(a.topicId),
          { hasAttempted: true, answersCount: a.answers?.length || 0, attemptId: a._id },
        ])
      );
      const totalMap = new Map(totalCounts.map((c) => [String(c._id), c.totalQuestions || 0]));

      result.data = result.data.map((t) => {
        const obj = t.toObject ? t.toObject() : t;
        const topicIdStr = String(obj._id);
        const attemptInfo = attemptedMap.get(topicIdStr) || { hasAttempted: false, answersCount: 0, attemptId: '' };
        obj.hasAttempted = attemptInfo.hasAttempted;
        obj.totalQuestions = totalMap.get(topicIdStr) || 0;
        obj.totalAnswers = attemptInfo.answersCount;
        obj.attemptId = attemptInfo.attemptId || '';
        return obj;
      });
    } else if (result.data?.length) {
      // No userId provided: still show totalQuestions, answers=0, hasAttempted=false
      const topicIds = result.data.map((t) => t._id);
      const totalCounts = await QuizQuestion.aggregate([
        { $match: { topicId: { $in: topicIds } } },
        { $group: { _id: '$topicId', totalQuestions: { $sum: 1 } } },
      ]);
      const totalMap = new Map(totalCounts.map((c) => [String(c._id), c.totalQuestions || 0]));
      result.data = result.data.map((t) => {
        const obj = t.toObject ? t.toObject() : t;
        const topicIdStr = String(obj._id);
        obj.hasAttempted = false;
        obj.totalQuestions = totalMap.get(topicIdStr) || 0;
        obj.totalAnswers = 0;
        obj.attemptId = '';
        return obj;
      });
    }

    return res.json(result);
  } catch (err) {
    logger.error('listTopics error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/quizzes/topics/getAllQuestions/:topicId
const getTopicWithQuestions = async (req, res) => {
  try {
    const { topicId } = req.params;
    const topic = await QuizTopic.findById(topicId).lean();
    if (!topic) return res.status(404).json({ message: 'Topic not found' });

    const questions = await QuizQuestion.find({ topicId, isActive: true })
      .sort({ order: 1, createdAt: 1 })
      .lean();

    return res.json({ ...topic, questions });
  } catch (err) {
    logger.error('getTopicWithQuestions error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// DELETE /api/quizzes/topics/:topicId
const deleteTopic = async (req, res) => {
  try {
    const { topicId } = req.params;
    const deleted = await QuizTopic.findByIdAndDelete(topicId);
    await QuizQuestion.deleteMany({ topicId });
    if (!deleted) return res.status(404).json({ message: 'Topic not found' });
    return res.json({ message: 'Topic and its questions deleted' });
  } catch (err) {
    logger.error('deleteTopic error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// DELETE /api/quizzes/questions/:questionId
const deleteQuestion = async (req, res) => {
  try {
    const { questionId } = req.params;
    const deleted = await QuizQuestion.findByIdAndDelete(questionId);
    if (!deleted) return res.status(404).json({ message: 'Question not found' });
    return res.json({ message: 'Question deleted' });
  } catch (err) {
    logger.error('deleteQuestion error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// PUT /api/quizzes/topics/:topicId
const updateTopic = async (req, res) => {
  try {
    const { topicId } = req.params;
    const { title, description, isActive } = req.body;
    const updated = await QuizTopic.findByIdAndUpdate(
      topicId,
      {
        $set: {
          ...(title !== undefined ? { title } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(isActive !== undefined ? { isActive } : {}),
        },
      },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: 'Topic not found' });
    return res.json(updated);
  } catch (err) {
    logger.error('updateTopic error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// PUT /api/quizzes/questions/:questionId
const updateQuestion = async (req, res) => {
  try {
    const { questionId } = req.params;
    const { prompt, options, correctOptionIndex, order, isActive } = req.body;

    if (options && options.length < 4) {
      return res.status(400).json({ message: 'At least 4 options are required' });
    }
    if (correctOptionIndex !== undefined && options && correctOptionIndex >= options.length) {
      return res.status(400).json({ message: 'correctOptionIndex must point to a valid option' });
    }

    const payload = {};
    if (prompt !== undefined) payload.prompt = prompt;
    if (options !== undefined) payload.options = options;
    if (correctOptionIndex !== undefined) payload.correctOptionIndex = correctOptionIndex;
    if (order !== undefined) payload.order = order;
    if (isActive !== undefined) payload.isActive = isActive;

    const updated = await QuizQuestion.findByIdAndUpdate(
      questionId,
      { $set: payload },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: 'Question not found' });
    return res.json(updated);
  } catch (err) {
    logger.error('updateQuestion error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// POST /api/quizzes/attempts
const startAttempt = async (req, res) => {
  try {
    const { userId, topicId, restart } = req.body;
    if (!userId || !topicId) {
      return res.status(400).json({ message: 'userId and topicId are required' });
    }

    let attempt = await QuizAttempt.findOne({ userId, topicId });
    if (!attempt) {
      attempt = await QuizAttempt.create({ userId, topicId });
    } else if (restart) {
      attempt.status = 'IN_PROGRESS';
      attempt.currentQuestionIndex = 0;
      attempt.answers = [];
      attempt.restartedAt = new Date();
      await attempt.save();
    }
    return res.json(attempt);
  } catch (err) {
    logger.error('startAttempt error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// POST /api/quizzes/attempts/:attemptId/answer
const answerQuestion = async (req, res) => {
  try {
    const { attemptId } = req.params;
    const { questionId, selectedOptionIndex } = req.body;
    const attempt = await QuizAttempt.findById(attemptId);
    if (!attempt) return res.status(404).json({ message: 'Attempt not found' });
    if (attempt.status === 'COMPLETED') return res.status(400).json({ message: 'Attempt already completed' });

    const question = await QuizQuestion.findById(questionId);
    if (!question) return res.status(404).json({ message: 'Question not found' });

    attempt.answers.push({ questionId, selectedOptionIndex });
    const topicQuestionsCount = await QuizQuestion.countDocuments({ topicId: attempt.topicId, isActive: true });
    attempt.currentQuestionIndex = attempt.answers.length;
    if (attempt.answers.length >= topicQuestionsCount) {
      attempt.status = 'COMPLETED';
    }
    await attempt.save();
    return res.json(attempt);
  } catch (err) {
    logger.error('answerQuestion error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/quizzes/attempts/:attemptId
const getAttempt = async (req, res) => {
  try {
    const { attemptId } = req.params;
    const attempt = await QuizAttempt.findById(attemptId).lean();
    if (!attempt) return res.status(404).json({ message: 'Attempt not found' });
    return res.json(attempt);
  } catch (err) {
    logger.error('getAttempt error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  createTopic,
  addQuestion,
  listTopics,
  getTopicWithQuestions,
  deleteTopic,
  deleteQuestion,
  startAttempt,
  answerQuestion,
  getAttempt,
  updateQuestion,
  updateTopic,
};

