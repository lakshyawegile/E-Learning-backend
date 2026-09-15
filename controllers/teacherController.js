const { Teacher } = require('../models');
const paginate = require('../utils/pagination');
const logger = require('../utils/logger');

// POST /api/teachers
const createTeacher = async (req, res) => {
  try {
    const { organizationId, name, expertise, bio, userId, isActive } = req.body;
    if (!organizationId || !name) {
      return res.status(400).json({ message: 'organizationId and name are required' });
    }

    const teacher = await Teacher.create({
      organizationId,
      name,
      expertise,
      bio,
      userId: userId || null,
      isActive: isActive !== undefined ? isActive : true,
    });

    return res.status(201).json(teacher);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Teacher already exists for this organization' });
    }
    logger.error('createTeacher error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/teachers
const getAllTeachers = async (req, res) => {
  try {
    const { page, limit } = req.query;
    const result = await paginate(Teacher, { page, limit, sort: { createdAt: -1 } });
    return res.json(result);
  } catch (err) {
    logger.error('getAllTeachers error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = { createTeacher, getAllTeachers };

