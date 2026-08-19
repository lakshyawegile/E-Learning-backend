const express = require('express');
const requireOrgAdmin = require('../middlewares/requireOrgAdmin');
const {
  createWebinarSchedule,
  listWebinarSchedules,
  updateWebinarSchedule,
  cancelWebinarSchedule,
} = require('../controllers/webinarScheduleController');

const router = express.Router();

router.get('/', requireOrgAdmin, listWebinarSchedules);
router.post('/', requireOrgAdmin, createWebinarSchedule);
router.put('/:id', requireOrgAdmin, updateWebinarSchedule);
router.delete('/:id', requireOrgAdmin, cancelWebinarSchedule);

module.exports = router;
