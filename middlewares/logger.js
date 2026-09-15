const logger = require('../utils/logger');

// Logs every request with its full payload AND full response body, so it is
// gated behind LOG_LEVEL=info and off by default. Beyond the sheer volume, the
// response body includes things like JWTs on login and user contact details —
// not something to leave writing to disk permanently.
const apiLogger = (req, res, next) => {
  if (!logger.isEnabled('info')) return next();

  const startTime = Date.now();
  const { method, originalUrl, body, query } = req;

  // Capture response
  const originalSend = res.json;
  res.json = function (data) {
    const duration = Date.now() - startTime;
    const logData = {
      method,
      endpoint: originalUrl,
      payload: { body, query },
      response: data,
      duration: `${duration}ms`,
    };
    logger.info('API Call:', JSON.stringify(logData, null, 2));
    originalSend.call(this, data);
  };

  next();
};

module.exports = apiLogger;
