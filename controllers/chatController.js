const { ChatRoom, ChatMessage, User, ChatRoomMembership } = require('../models');
const { containsNumericLikeText } = require('../utils/regex');
const logger = require('../utils/logger');

const formatIST = (date) => {
  if (!date) return '';
  // Example output: "2026-04-22 03:45:10 PM"
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
    .format(date)
    .replace(/\//g, '-'); // 22-04-2026, 03:45:10 pm -> keep consistent separators
};

const toSlug = (s) =>
  String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const requireOrg = (req, res) => {
  const organizationId = req.user?.organizationId;
  if (!organizationId) {
    res.status(400).json({ message: 'User organization not found' });
    return null;
  }
  return organizationId;
};

// GET /api/chat/rooms
const listRooms = async (req, res) => {
  try {
    const organizationId = requireOrg(req, res);
    if (!organizationId) return;

    const userId = req.user?.userId;

    const rooms = await ChatRoom.find({ organizationId, isActive: true })
      .sort({ createdAt: 1 })
      .lean();

    let membershipByRoomId = new Map();
    if (userId) {
      const roomIds = rooms.map((r) => r._id);
      const memberships = await ChatRoomMembership.find({
        organizationId,
        userId,
        roomId: { $in: roomIds },
      })
        .select({ roomId: 1, joinedAt: 1 })
        .lean();

      membershipByRoomId = new Map(
        memberships.map((m) => [String(m.roomId), { joined: true, joinedAt: m.joinedAt }])
      );
    }

    return res.json({
      success: true,
      data: rooms.map((r) => ({
        roomId: r._id,
        name: r.name,
        slug: r.slug,
        isActive: r.isActive,
        joined: membershipByRoomId.get(String(r._id))?.joined ?? false,
        joinedAt: membershipByRoomId.get(String(r._id))?.joinedAt ?? null,
      })),
    });
  } catch (err) {
    logger.error('listRooms error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// POST /api/chat/rooms (admin)
const createRoom = async (req, res) => {
  try {
    const organizationId = requireOrg(req, res);
    if (!organizationId) return;

    const userId = req.user?.userId;
    const { name, slug } = req.body || {};
    if (!name) return res.status(400).json({ message: 'name is required' });

    const finalSlug = slug ? toSlug(slug) : toSlug(name);
    if (!finalSlug) return res.status(400).json({ message: 'slug is invalid' });

    const room = await ChatRoom.create({
      organizationId,
      name: String(name).trim(),
      slug: finalSlug,
      createdBy: userId || null,
      isActive: true,
    });

    return res.status(201).json({
      success: true,
      data: { roomId: room._id, name: room.name, slug: room.slug, isActive: room.isActive },
    });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ message: 'Room slug already exists' });
    }
    logger.error('createRoom error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// PATCH /api/chat/rooms/:roomId (admin)
const updateRoom = async (req, res) => {
  try {
    const organizationId = requireOrg(req, res);
    if (!organizationId) return;

    const { roomId } = req.params;
    const { name, slug, isActive } = req.body || {};
    const toSet = {};
    if (name !== undefined) toSet.name = String(name).trim();
    if (slug !== undefined) toSet.slug = toSlug(slug);
    if (isActive !== undefined) toSet.isActive = Boolean(isActive);

    const room = await ChatRoom.findOneAndUpdate(
      { _id: roomId, organizationId },
      { $set: toSet },
      { new: true, runValidators: true }
    ).lean();

    if (!room) return res.status(404).json({ message: 'Room not found' });

    return res.json({
      success: true,
      data: { roomId: room._id, name: room.name, slug: room.slug, isActive: room.isActive },
    });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ message: 'Room slug already exists' });
    }
    logger.error('updateRoom error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// DELETE /api/chat/rooms/:roomId (admin) (soft delete)
const deleteRoom = async (req, res) => {
  try {
    const organizationId = requireOrg(req, res);
    if (!organizationId) return;

    const { roomId } = req.params;
    const room = await ChatRoom.findOneAndUpdate(
      { _id: roomId, organizationId },
      { $set: { isActive: false } },
      { new: true }
    ).lean();

    if (!room) return res.status(404).json({ message: 'Room not found' });
    return res.json({ success: true });
  } catch (err) {
    logger.error('deleteRoom error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// POST /api/chat/rooms/:roomId/join
// User must join before they can view new messages.
const joinRoom = async (req, res) => {
  try {
    const organizationId = requireOrg(req, res);
    if (!organizationId) return;

    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const { roomId } = req.params;

    const room = await ChatRoom.findOne({ _id: roomId, organizationId, isActive: true }).lean();
    if (!room) return res.status(404).json({ message: 'Room not found' });

    const membership = await ChatRoomMembership.findOneAndUpdate(
      { organizationId, roomId, userId },
      { $setOnInsert: { joinedAt: new Date() } },
      { upsert: true, new: true }
    ).lean();

    return res.json({
      success: true,
      data: {
        roomId: membership.roomId,
        userId: membership.userId,
        joinedAt: membership.joinedAt,
      },
    });
  } catch (err) {
    logger.error('joinRoom error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/chat/rooms/:roomId/messages?cursor=<messageId>&limit=50
// Privacy: never return phone/mobile. senderId is allowed (internal user id).
const listMessages = async (req, res) => {
  try {
    const organizationId = requireOrg(req, res);
    if (!organizationId) return;

    const userId = req.user?.userId;
    const role = req.user?.role;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const { roomId } = req.params;
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 50));
    const cursor = req.query.cursor ? String(req.query.cursor) : null;

    const room = await ChatRoom.findOne({ _id: roomId, organizationId, isActive: true }).lean();
    if (!room) return res.status(404).json({ message: 'Room not found' });

    const filter = { organizationId, roomId };
    const isAdminRole = role === 'ORG_ADMIN' || role === 'SUPER_ADMIN';

    if (!isAdminRole) {
      // Join gating: normal users can only view messages after they click "Join"
      const membership = await ChatRoomMembership.findOne({ organizationId, roomId, userId }).lean();
      if (!membership) {
        return res.json({
          success: true,
          data: [],
          meta: { nextCursor: null },
        });
      }
      // Only show messages created at/after joinedAt
      filter.createdAt = { $gte: membership.joinedAt };
    }
    if (cursor) {
      filter._id = { $lt: cursor };
    }

    const messages = await ChatMessage.find(filter)
      .sort({ _id: -1 })
      .limit(limit)
      .lean();

    const nextCursor = messages.length ? String(messages[messages.length - 1]._id) : null;

    return res.json({
      success: true,
      data: messages
        .reverse()
        .map((m) => ({
          messageId: m._id,
          senderId: m.senderUserId,
          senderName: m.senderName,
          message: m.message,
          timestamp: m.createdAt, // UTC Date
          timestampIST: formatIST(m.createdAt),
          isAdmin: m.isAdmin,
        })),
      meta: { nextCursor },
    });
  } catch (err) {
    logger.error('listMessages error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// POST /api/chat/rooms/:roomId/messages
const postMessage = async (req, res) => {
  try {
    const organizationId = requireOrg(req, res);
    if (!organizationId) return;

    const userId = req.user?.userId;
    const role = req.user?.role;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const { roomId } = req.params;
    const { message } = req.body || {};
    if (!message || !String(message).trim()) return res.status(400).json({ message: 'message is required' });
    if (containsNumericLikeText(message)) {
      return res.status(400).json({ message: 'Numbers are not allowed in chat messages' });
    }

    const room = await ChatRoom.findOne({ _id: roomId, organizationId, isActive: true }).lean();
    if (!room) return res.status(404).json({ message: 'Room not found' });

    const isAdminRole = role === 'ORG_ADMIN' || role === 'SUPER_ADMIN';

    // Join required for normal users. Admins can post without joining; we auto-create membership.
    const membership = await ChatRoomMembership.findOne({ organizationId, roomId, userId }).lean();
    if (!membership) {
      if (!isAdminRole) {
        return res.status(403).json({ message: 'Please join the room first' });
      }
      await ChatRoomMembership.updateOne(
        { organizationId, roomId, userId },
        { $setOnInsert: { joinedAt: new Date() } },
        { upsert: true }
      );
    }

    const user = await User.findById(userId).lean();
    const senderName = user?.name ? String(user.name).trim() : 'User';
    const isAdmin = isAdminRole;

    const saved = await ChatMessage.create({
      organizationId,
      roomId,
      senderUserId: userId,
      senderName,
      message: String(message).trim(),
      isAdmin,
    });

    return res.status(201).json({
      success: true,
      data: {
        messageId: saved._id,
        senderId: saved.senderUserId,
        senderName: saved.senderName,
        message: saved.message,
        timestamp: saved.createdAt, // UTC Date
        timestampIST: formatIST(saved.createdAt),
        isAdmin: saved.isAdmin,
      },
    });
  } catch (err) {
    logger.error('postMessage error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  listRooms,
  createRoom,
  updateRoom,
  deleteRoom,
  listMessages,
  joinRoom,
  postMessage,
};

