const express = require('express');
const requireOrgAdmin = require('../middlewares/requireOrgAdmin');
const {
  getPremiumFeaturesConfig,
  upsertPremiumFeaturesConfig,
} = require('../controllers/premiumFeaturesController');

const router = express.Router();

router.get('/config', getPremiumFeaturesConfig);
router.put('/config', requireOrgAdmin, upsertPremiumFeaturesConfig);

module.exports = router;
