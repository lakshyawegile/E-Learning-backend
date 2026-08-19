const express = require('express');
const requireOrgAdmin = require('../middlewares/requireOrgAdmin');
const {
  getOneOnOneConfig,
  upsertOneOnOneConfig,
} = require('../controllers/oneOnOneController');

const router = express.Router();

router.get('/config', getOneOnOneConfig);
router.put('/config', requireOrgAdmin, upsertOneOnOneConfig);

module.exports = router;
