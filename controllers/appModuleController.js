const { AppModuleConfig } = require('../models');
const logger = require('../utils/logger');

const DEFAULT_MODULES = {
  carousel: true,
  courses: true,
  continueLearning: false,
  quizzes: false,
  freeVideos: true,
  tools: true,
  news: true,
  banners: true,
  shortVideos: true,
  aiChat: true,
  isAppOnline: true,
};  

// GET /api/app-modules
const getAppModules = async (req, res) => {
  try {
    const config = await AppModuleConfig.getSingleton();
    const data = config
      ? {
          carousel: config.carousel ?? DEFAULT_MODULES.carousel,
          courses: config.courses ?? DEFAULT_MODULES.courses,
          continueLearning: config.continueLearning ?? DEFAULT_MODULES.continueLearning,
          quizzes: config.quizzes ?? DEFAULT_MODULES.quizzes,
          freeVideos: config.freeVideos ?? DEFAULT_MODULES.freeVideos,
          tools: config.tools ?? DEFAULT_MODULES.tools,
          news: config.news ?? DEFAULT_MODULES.news,
          banners: config.banners ?? DEFAULT_MODULES.banners,
          shortVideos: config.shortVideos ?? DEFAULT_MODULES.shortVideos,
          aiChat: config.aiChat ?? DEFAULT_MODULES.aiChat,
          isAppOnline: config.isAppOnline ?? DEFAULT_MODULES.isAppOnline,
        }
      : { ...DEFAULT_MODULES };

    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    logger.error('getAppModules error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = { getAppModules };
