const express = require('express');
const requireOrgAdmin = require('../middlewares/requireOrgAdmin');
const { updateSocialLinks } = require('../controllers/socialLinksController');

const router = express.Router();

// GET /social-links is mounted publicly (with optional auth) in routes/index.js
router.put('/social-links', requireOrgAdmin, updateSocialLinks);

module.exports = router;

