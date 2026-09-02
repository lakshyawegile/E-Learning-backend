const express = require('express');
const { createFreeVideo, listFreeVideos, getFreeVideoById, updateFreeVideo } = require('../controllers/freeVideoController');

const router = express.Router();

router.post('/', createFreeVideo);
router.get('/', listFreeVideos);
router.get('/:videoId', getFreeVideoById);
router.put('/:videoId', updateFreeVideo);

module.exports = router;

