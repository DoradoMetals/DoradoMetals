const express = require("express");
const { generatePackingList, generateReturnPackingList, generateInvoice } = require("../controllers/pdfController");
const router = express.Router();

router.post("/generate_packing_list", generatePackingList);
router.post("/generate_return_packing_list", generateReturnPackingList);
router.post("/generate_invoice", generateInvoice);

module.exports = router;
