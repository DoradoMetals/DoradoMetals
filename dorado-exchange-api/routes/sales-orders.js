const express = require("express");
const { requireUser, requireAdmin } = require("../middleware/authMiddleware");
const {
  createSalesOrder,
  getSalesOrders,
  getOrderMetals,
  getAllSalesOrders,
} = require("../controllers/salesOrderController");

const router = express.Router();

// user
router.post("/create_sales_order", requireUser, createSalesOrder);
router.get("/get_sales_orders", requireUser, getSalesOrders);
router.post("/get_order_metals", requireUser, getOrderMetals);

// admin
router.get("/get_all", requireAdmin, getAllSalesOrders);

module.exports = router;
