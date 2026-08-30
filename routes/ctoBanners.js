const express = require('express');
const { createCtoBanner, listCtoBanners, updateCtoBanner, deleteCtoBanner } = require('../controllers/ctoBannerController');

const router = express.Router();

router.post('/', createCtoBanner);
router.get('/', listCtoBanners);
router.put('/:bannerId', updateCtoBanner);
router.delete('/:bannerId', deleteCtoBanner);

module.exports = router;

