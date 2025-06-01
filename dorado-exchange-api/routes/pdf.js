const express = require("express");
const { generatePackingList, generateReturnPackingList, generateInvoice } = require("../controllers/pdfController");
const { requireUser } = require("../middleware/authMiddleware");
const router = express.Router();

router.post("/generate_packing_list", requireUser, generatePackingList);
router.post("/generate_return_packing_list", requireUser, generateReturnPackingList);
router.post("/generate_invoice", requireUser, generateInvoice);

module.exports = router;
