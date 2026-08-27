const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { NO_TOKEN, INVALID_TOKEN, TOKEN_EXPIRED, USER_NOT_FOUND } = require('../constants/authErrors');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json(NO_TOKEN);
    }

    const token = authHeader.substring(7);

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json(TOKEN_EXPIRED);
      }
      if (err.name === 'JsonWebTokenError') {
        return res.status(401).json(INVALID_TOKEN);
      }
      throw err;
    }

    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json(USER_NOT_FOUND);
    }

    req.user = {
      userId: decoded.userId,
      role: decoded.role,
      organizationId: decoded.organizationId,
    };

    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

const authenticateOptional = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return next();
    }

    const user = await User.findById(decoded.userId);
    if (user) {
      req.user = {
        userId: decoded.userId,
        role: decoded.role,
        organizationId: decoded.organizationId,
      };
    }

    next();
  } catch (err) {
    console.error('Optional auth middleware error:', err);
    next();
  }
};

module.exports = authenticate;
module.exports.optional = authenticateOptional;
