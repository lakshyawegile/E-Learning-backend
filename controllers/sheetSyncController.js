const logger = require('../utils/logger');
// POST /api/sheet-sync
const sheetSync = async (req, res) => {
  try {
    const data = req.body;
    logger.info('Received:', data);
    return res.json({ success: true });
  } catch (err) {
    logger.error('sheetSync error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = { sheetSync };

