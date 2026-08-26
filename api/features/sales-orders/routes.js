import express from "express";
import {
  createSalesOrder,
  getSalesOrders,
  getOrderMetals,
  getAllSalesOrders,
  sendOrderToSupplier,
  updateOrderTracking,
  updateStatus,
  adminCreateSalesOrder,
  createReview,
} from "#features/sales-orders/controller.ts";

import {
  requireUser,
  requireAdmin,
} from "#shared/middleware/authMiddleware.js";
// See features/purchase-orders/routes.js: requireUser asks whether somebody is
// signed in, this asks whether the order is theirs.
import { requireOwnOrder } from "#shared/middleware/ownership.js";

const router = express.Router();

// user
router.post("/create_sales_order", requireUser, createSalesOrder);
router.get("/get_sales_orders", requireUser, getSalesOrders);
router.post("/get_order_metals", requireUser, requireOwnOrder, getOrderMetals);
router.post("/create_review", requireUser, requireOwnOrder, createReview);

// admin
router.get("/get_all", requireAdmin, getAllSalesOrders);
router.post("/update_status", requireAdmin, updateStatus);
router.post("/send_order_to_supplier", requireAdmin, sendOrderToSupplier);
router.post("/update_tracking", requireAdmin, updateOrderTracking);
router.post("/admin_create_sales_order", requireAdmin, adminCreateSalesOrder);

export default router;
