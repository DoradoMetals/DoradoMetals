const express = require("express");
const { generatePackingList, generateReturnPackingList } = require("../controllers/pdfController");
const router = express.Router();

router.post("/generate_packing_list", generatePackingList);
router.post("/generate_return_packing_list", generateReturnPackingList);

module.exports = router;
