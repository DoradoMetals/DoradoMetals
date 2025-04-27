const express = require('express');
const { generatePackingList } = require('../controllers/pdfController');
const router = express.Router();


router.post('/generate_packing_list', generatePackingList);

module.exports = router;