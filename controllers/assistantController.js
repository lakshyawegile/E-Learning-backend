const {
  AssistantStarterConfig,
  AssistantConversation,
  AssistantMessage,
} = require('../models');
const { getAssistantReply } = require('../services/openaiAssistant');
const paginate = require('../utils/pagination');
const logger = require('../utils/logger');

const DEFAULT_STARTERS = [
  { text: 'What is IEC code and how do I apply for it?', order: 1 },
  { text: 'What is the difference between FOB and CIF?', order: 2 },
  { text: 'Which documents are required for export from India?', order: 3 },
  { text: 'How do import customs duty and GST work?', order: 4 },
  { text: 'How do I start an import business in India?', order: 5 },
  { text: 'What is HS code and why does it matter?', order: 6 },
];

const previewText = (text, max = 80) => {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
};

const titleFromMessage = (text) => previewText(text, 60) || 'New chat';

const mapStarter = (s) => ({
  id: String(s._id || s.id || ''),
  text: s.text,
  order: s.order ?? 0,
});

// GET /api/assistant/starters
// New chat screen: predefined questions + whether old chats exist
const getStarters = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const organizationId = req.user?.organizationId;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    if (!organizationId) return res.status(400).json({ message: 'User organization not found' });

    const [config, oldChatCount] = await Promise.all([
      AssistantStarterConfig.findOne({ organizationId, isActive: true }).lean(),
      AssistantConversation.countDocuments({ userId, organizationId, isActive: true }),
    ]);

    let starters = (config?.starters || [])
      .filter((s) => s.isActive !== false && s.text)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(mapStarter);

    if (!starters.length) {
      starters = DEFAULT_STARTERS.map((s, i) => ({
        id: `default-${i + 1}`,
        text: s.text,
        order: s.order,
      }));
    }

    return res.json({
      success: true,
      data: {
        starters,
        hasOldChats: oldChatCount > 0,
        oldChatsCount: oldChatCount,
      },
    });
  } catch (err) {
    logger.error('getStarters error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// PUT /api/assistant/starters (admin)
// Body: { starters: [{ text, order?, isActive? }], isActive? }
const upsertStarters = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    const updatedBy = req.user?.userId || null;
    if (!organizationId) return res.status(400).json({ message: 'User organization not found' });

    const { starters, isActive } = req.body || {};
    if (!Array.isArray(starters)) {
      return res.status(400).json({ message: 'starters must be an array' });
    }

    const normalized = starters
      .map((s, index) => ({
        text: String(s?.text || '').trim(),
        order: Number.isFinite(Number(s?.order)) ? Number(s.order) : index + 1,
        isActive: s?.isActive === undefined ? true : Boolean(s.isActive),
      }))
      .filter((s) => s.text);

    if (!normalized.length) {
      return res.status(400).json({ message: 'At least one starter question is required' });
    }

    const toSet = {
      organizationId,
      starters: normalized,
      updatedBy,
    };
    if (isActive !== undefined) toSet.isActive = Boolean(isActive);

    const saved = await AssistantStarterConfig.findOneAndUpdate(
      { organizationId },
      { $set: toSet },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    ).lean();

    return res.json({
      success: true,
      data: {
        starters: (saved.starters || [])
          .filter((s) => s.isActive !== false)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map(mapStarter),
        isActive: saved.isActive,
      },
    });
  } catch (err) {
    logger.error('upsertStarters error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/assistant/conversations
// WhatsApp-style list of old chats
const listConversations = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const organizationId = req.user?.organizationId;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    if (!organizationId) return res.status(400).json({ message: 'User organization not found' });

    const page = req.query.page || 1;
    const limit = req.query.limit || 20;

    const result = await paginate(AssistantConversation, {
      filter: { userId, organizationId, isActive: true },
      sort: { lastMessageAt: -1 },
      page,
      limit,
      projection: {
        title: 1,
        lastMessageAt: 1,
        lastMessagePreview: 1,
        messageCount: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    });

    return res.json({
      success: true,
      data: result.data,
      meta: result.meta,
    });
  } catch (err) {
    logger.error('listConversations error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/assistant/conversations/:conversationId
// Open one old chat + all messages (continue with context)
const getConversation = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const organizationId = req.user?.organizationId;
    const { conversationId } = req.params;

    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    if (!organizationId) return res.status(400).json({ message: 'User organization not found' });

    const conversation = await AssistantConversation.findOne({
      _id: conversationId,
      userId,
      organizationId,
      isActive: true,
    }).lean();

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    const messages = await AssistantMessage.find({
      conversationId: conversation._id,
      userId,
      organizationId,
    })
      .sort({ createdAt: 1 })
      .select({ role: 1, content: 1, createdAt: 1 })
      .lean();

    return res.json({
      success: true,
      data: {
        conversation: {
          id: String(conversation._id),
          title: conversation.title,
          lastMessageAt: conversation.lastMessageAt,
          lastMessagePreview: conversation.lastMessagePreview,
          messageCount: conversation.messageCount,
          createdAt: conversation.createdAt,
        },
        messages: messages.map((m) => ({
          id: String(m._id),
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
        })),
      },
    });
  } catch (err) {
    logger.error('getConversation error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// POST /api/assistant/chat
// Body: { message, conversationId? }
// - No conversationId => new chat (no prior history to OpenAI)
// - With conversationId => continue that chat with its context
const sendMessage = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const organizationId = req.user?.organizationId;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    if (!organizationId) return res.status(400).json({ message: 'User organization not found' });

    const message = String(req.body?.message || '').trim();
    const conversationId = req.body?.conversationId || null;

    if (!message) {
      return res.status(400).json({ message: 'message is required' });
    }
    if (message.length > 4000) {
      return res.status(400).json({ message: 'message is too long (max 4000 characters)' });
    }

    let conversation = null;
    let historyForOpenAI = [];

    if (conversationId) {
      conversation = await AssistantConversation.findOne({
        _id: conversationId,
        userId,
        organizationId,
        isActive: true,
      });

      if (!conversation) {
        return res.status(404).json({ message: 'Conversation not found' });
      }

      const prior = await AssistantMessage.find({
        conversationId: conversation._id,
        userId,
        organizationId,
      })
        .sort({ createdAt: 1 })
        .select({ role: 1, content: 1 })
        .lean();

      historyForOpenAI = prior.map((m) => ({ role: m.role, content: m.content }));
    } else {
      conversation = await AssistantConversation.create({
        organizationId,
        userId,
        title: titleFromMessage(message),
        lastMessageAt: new Date(),
        lastMessagePreview: '',
        messageCount: 0,
      });
      // New chat: do not send any previous chats to OpenAI
      historyForOpenAI = [];
    }

    let assistantContent;
    try {
      assistantContent = await getAssistantReply(historyForOpenAI, message);
    } catch (aiErr) {
      logger.error('OpenAI assistant error:', aiErr);
      // New chat with no messages yet — remove empty shell conversation
      if (!conversationId && conversation?._id) {
        await AssistantConversation.deleteOne({ _id: conversation._id }).catch(() => {});
      }
      if (aiErr.code === 'OPENAI_NOT_CONFIGURED') {
        return res.status(503).json({ message: 'AI assistant is not configured' });
      }
      return res.status(502).json({
        message: 'Failed to get response from AI',
        detail: aiErr.message || undefined,
      });
    }

    const [userMsg, assistantMsg] = await AssistantMessage.create([
      {
        organizationId,
        conversationId: conversation._id,
        userId,
        role: 'user',
        content: message,
      },
      {
        organizationId,
        conversationId: conversation._id,
        userId,
        role: 'assistant',
        content: assistantContent,
      },
    ]);

    conversation.lastMessageAt = new Date();
    conversation.lastMessagePreview = previewText(assistantContent);
    conversation.messageCount = (conversation.messageCount || 0) + 2;
    if (!conversationId && (!conversation.title || conversation.title === 'New chat')) {
      conversation.title = titleFromMessage(message);
    }
    await conversation.save();

    return res.json({
      success: true,
      data: {
        conversationId: String(conversation._id),
        conversation: {
          id: String(conversation._id),
          title: conversation.title,
          lastMessageAt: conversation.lastMessageAt,
          lastMessagePreview: conversation.lastMessagePreview,
          messageCount: conversation.messageCount,
        },
        userMessage: {
          id: String(userMsg._id),
          role: 'user',
          content: userMsg.content,
          createdAt: userMsg.createdAt,
        },
        assistantMessage: {
          id: String(assistantMsg._id),
          role: 'assistant',
          content: assistantMsg.content,
          createdAt: assistantMsg.createdAt,
        },
      },
    });
  } catch (err) {
    logger.error('sendMessage error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  getStarters,
  upsertStarters,
  listConversations,
  getConversation,
  sendMessage,
};
