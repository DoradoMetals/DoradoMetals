const express = require("express");
const { requireUser } = require("../middleware/authMiddleware");
const router = express.Router();

const {
  generatePackingList,
  generateReturnPackingList,
  generateInvoice,
  generateSalesOrderInvoice,
} = require("../controllers/pdfController");

router.post("/generate_packing_list", requireUser, generatePackingList);
router.post(
  "/generate_return_packing_list",
  requireUser,
  generateReturnPackingList
);
router.post("/generate_invoice", requireUser, generateInvoice);
router.post(
  "/generate_sales_order_invoice",
  requireUser,
  generateSalesOrderInvoice
);

module.exports = router;
