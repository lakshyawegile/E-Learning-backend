const mongoose = require('mongoose');
const { PlatformPremiumAccess, User } = require('../models');
const logger = require('../utils/logger');

const { Types } = mongoose;

function requireAdmin(req, res) {
  const role = req.user?.role;
  if (role !== 'SUPER_ADMIN' && role !== 'ORG_ADMIN') {
    res.status(403).json({ message: 'Forbidden' });
    return false;
  }
  return true;
}

async function assertCanAccessUser(req, targetUser) {
  const requesterRole = req.user?.role;
  const requesterOrgId = req.user?.organizationId;
  if (requesterRole === 'SUPER_ADMIN') return true;
  if (requesterRole === 'ORG_ADMIN') {
    const tid = targetUser.organizationId ? String(targetUser.organizationId) : null;
    const rid = requesterOrgId ? String(requesterOrgId) : null;
    return Boolean(tid && rid && tid === rid);
  }
  return false;
}

// GET /api/user/admin/premium-access?userId=
const listPlatformPremiumAccess = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const { userId } = req.query;
    if (!userId || !Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Valid userId query param is required' });
    }
    const targetUser = await User.findById(userId).lean();
    if (!targetUser) return res.status(404).json({ message: 'User not found' });
    if (!(await assertCanAccessUser(req, targetUser))) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const data = await PlatformPremiumAccess.find({ userId })
      .sort({ createdAt: -1 })
      .populate('grantedBy', 'name email mobile')
      .lean();

    return res.json({ data });
  } catch (err) {
    logger.error('listPlatformPremiumAccess error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// POST /api/user/admin/premium-access — dashboard grant (replaces other ACTIVE platform grants for this user)
// Body: userId, startDate?, endDate, notes?
const createPlatformPremiumAccess = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const { userId, startDate, endDate, notes } = req.body;
    if (!userId || !endDate) {
      return res.status(400).json({ message: 'userId and endDate are required' });
    }
    if (!Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid userId' });
    }

    const targetUser = await User.findById(userId).lean();
    if (!targetUser) return res.status(404).json({ message: 'User not found' });
    if (!(await assertCanAccessUser(req, targetUser))) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const start = startDate ? new Date(startDate) : new Date();
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return res.status(400).json({ message: 'Invalid startDate or endDate' });
    }
    if (end <= start) {
      return res.status(400).json({ message: 'endDate must be after startDate' });
    }

    await PlatformPremiumAccess.updateMany(
      { userId, status: 'ACTIVE' },
      { $set: { status: 'CANCELLED' } }
    );

    const grantedBy = req.user.userId;
    const organizationId = targetUser.organizationId || null;

    const doc = await PlatformPremiumAccess.create({
      userId,
      organizationId,
      startDate: start,
      endDate: end,
      status: 'ACTIVE',
      grantedBy,
      notes: notes != null ? String(notes).trim() : '',
    });

    const populated = await PlatformPremiumAccess.findById(doc._id)
      .populate('grantedBy', 'name email mobile')
      .lean();

    return res.status(201).json(populated);
  } catch (err) {
    logger.error('createPlatformPremiumAccess error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// PUT /api/user/admin/premium-access/:grantId
const updatePlatformPremiumAccess = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const { grantId } = req.params;
    if (!Types.ObjectId.isValid(grantId)) {
      return res.status(400).json({ message: 'Invalid grant id' });
    }

    const grant = await PlatformPremiumAccess.findById(grantId);
    if (!grant) return res.status(404).json({ message: 'Premium access not found' });

    const targetUser = await User.findById(grant.userId).lean();
    if (!targetUser) return res.status(404).json({ message: 'User not found' });
    if (!(await assertCanAccessUser(req, targetUser))) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    if (req.user.role === 'ORG_ADMIN' && req.user.organizationId && grant.organizationId) {
      if (String(grant.organizationId) !== String(req.user.organizationId)) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    }

    const { startDate, endDate, notes, status } = req.body;
    if (startDate !== undefined) grant.startDate = new Date(startDate);
    if (endDate !== undefined) grant.endDate = new Date(endDate);
    if (notes !== undefined) grant.notes = String(notes).trim();
    if (status !== undefined) {
      if (!['ACTIVE', 'CANCELLED'].includes(status)) {
        return res.status(400).json({ message: 'status must be ACTIVE or CANCELLED' });
      }
      grant.status = status;
    }

    if (Number.isNaN(grant.startDate.getTime()) || Number.isNaN(grant.endDate.getTime())) {
      return res.status(400).json({ message: 'Invalid dates' });
    }
    if (grant.endDate <= grant.startDate) {
      return res.status(400).json({ message: 'endDate must be after startDate' });
    }

    await grant.save();

    const populated = await PlatformPremiumAccess.findById(grant._id)
      .populate('grantedBy', 'name email mobile')
      .lean();

    return res.json(populated);
  } catch (err) {
    logger.error('updatePlatformPremiumAccess error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// DELETE /api/user/admin/premium-access/:grantId — set status CANCELLED
const cancelPlatformPremiumAccess = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const { grantId } = req.params;
    if (!Types.ObjectId.isValid(grantId)) {
      return res.status(400).json({ message: 'Invalid grant id' });
    }

    const grant = await PlatformPremiumAccess.findById(grantId);
    if (!grant) return res.status(404).json({ message: 'Premium access not found' });

    const targetUser = await User.findById(grant.userId).lean();
    if (!targetUser) return res.status(404).json({ message: 'User not found' });
    if (!(await assertCanAccessUser(req, targetUser))) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    if (req.user.role === 'ORG_ADMIN' && req.user.organizationId && grant.organizationId) {
      if (String(grant.organizationId) !== String(req.user.organizationId)) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    }

    grant.status = 'CANCELLED';
    await grant.save();

    return res.json({ message: 'Premium access revoked', grant: grant.toObject() });
  } catch (err) {
    logger.error('cancelPlatformPremiumAccess error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  listPlatformPremiumAccess,
  createPlatformPremiumAccess,
  updatePlatformPremiumAccess,
  cancelPlatformPremiumAccess,
};
