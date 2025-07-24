const express = require("express");
const { requireUser, requireAdmin } = require("../middleware/authMiddleware");
const {
  createSalesOrder,
  getSalesOrders,
  getOrderMetals,
  getAllSalesOrders,
  sendOrderToSupplier,
  updateOrderTracking,
  updateStatus,
  adminCreateSalesOrder,
} = require("../controllers/salesOrderController");

const router = express.Router();

// user
router.post("/create_sales_order", requireUser, createSalesOrder);
router.get("/get_sales_orders", requireUser, getSalesOrders);
router.post("/get_order_metals", requireUser, getOrderMetals);

// admin
router.get("/get_all", requireAdmin, getAllSalesOrders);
router.post("/update_status", requireAdmin, updateStatus);
router.post("/send_order_to_supplier", requireAdmin, sendOrderToSupplier);
router.post("/update_tracking", requireAdmin, updateOrderTracking);
router.post("/admin_create_sales_order", requireAdmin, adminCreateSalesOrder);

module.exports = router;
