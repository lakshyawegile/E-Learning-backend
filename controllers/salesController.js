const { User } = require('../models');
const logger = require('../utils/logger');

// POST /api/sales
const createSalesUser = async (req, res) => {
  try {
    const { organizationId, name, email, mobile } = req.body;
    if (!organizationId || !name || !email || !mobile) {
      return res.status(400).json({ message: 'organizationId, name, email, and mobile are required' });
    }

    // role is fixed to SALES
    const role = 'SALES';

    // enforce uniqueness by email and (role, mobile)
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(409).json({ message: 'Email already in use' });
    }
    const existingMobileRole = await User.findOne({ mobile, role });
    if (existingMobileRole) {
      return res.status(409).json({ message: 'Mobile already in use for SALES role' });
    }

    const user = await User.create({ organizationId, name, email, mobile, role });
    return res.status(201).json(user);
  } catch (err) {
    logger.error('createSalesUser error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/sales
const listSalesUsers = async (req, res) => {
  try {
    const { organizationId } = req.query;
    const filter = { role: 'SALES' };
    if (organizationId) filter.organizationId = organizationId;

    const sales = await User.find(filter).sort({ createdAt: -1 });
    return res.json(sales);
  } catch (err) {
    logger.error('listSalesUsers error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// PUT /api/sales/:userId
const updateSalesUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, email, mobile, isActive } = req.body; 

    const user = await User.findOne({ _id: userId, role: 'SALES' });
    if (!user) return res.status(404).json({ message: 'Sales user not found' });

    // uniqueness checks if fields change
    if (email && email !== user.email) {
      const existingEmail = await User.findOne({ email });
      if (existingEmail) return res.status(409).json({ message: 'Email already in use' });
    }
    if (mobile && mobile !== user.mobile) {
      const existingMobileRole = await User.findOne({ mobile, role: 'SALES' });
      if (existingMobileRole) return res.status(409).json({ message: 'Mobile already in use for SALES role' });
    }

    if (name !== undefined) user.name = name;
    if (email !== undefined) user.email = email;
    if (mobile !== undefined) user.mobile = mobile;
    if (isActive !== undefined) user.isActive = isActive;
    await user.save();
    return res.json(user);
  } catch (err) {
    logger.error('updateSalesUser error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  createSalesUser,
  listSalesUsers,
  updateSalesUser,
};

