const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async (uri = process.env.MONGODB_URI) => {
  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(uri, {
      autoIndex: true,
    });
    // Connection ready
  } catch (err) {
    logger.error('MongoDB connection error:', err.message);
    throw err;
  }
};

module.exports = connectDB;

