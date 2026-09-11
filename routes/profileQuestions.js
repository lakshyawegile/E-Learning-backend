const express = require('express');
const {
  getProfileQuestions,
  submitAnswers,
  getScreenCatalog,
} = require('../controllers/profileQuestionsController');
const { getConfig, upsertConfig } = require('../controllers/profileQuestionsConfigController');
const requireOrgAdmin = require('../middlewares/requireOrgAdmin');

const router = express.Router();

// Admin config — declared before '/' so the static paths win
router.get('/config', requireOrgAdmin, getConfig);
router.put('/config', requireOrgAdmin, upsertConfig);
router.get('/screen-catalog', requireOrgAdmin, getScreenCatalog);

// App
router.get('/', getProfileQuestions);
router.post('/answers', submitAnswers);

module.exports = router;
