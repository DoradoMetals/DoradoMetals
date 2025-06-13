const express = require("express");
const { requireUser, requireAdmin } = require("../middleware/authMiddleware");
const { createSalesOrder } = require("../controllers/salesOrderController");

const router = express.Router();

// user
router.post("/create_sales_order", requireUser, createSalesOrder);

module.exports = router;
