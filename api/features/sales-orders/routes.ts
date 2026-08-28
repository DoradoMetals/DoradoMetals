import express from "express";
import {
  createSalesOrder,
  getSalesOrders,
  getOrderMetals,
  getAllSalesOrders,
  adminCreateSalesOrder,
  createReview,
} from "#features/sales-orders/controller.ts";

import {
  requireUser,
  requireAdmin,
} from "#shared/middleware/authMiddleware.ts";
// See features/purchase-orders/routes.js: requireUser asks whether somebody is
// signed in, this asks whether the order is theirs.
import { requireOwnOrder } from "#shared/middleware/ownership.ts";

const router = express.Router();

// ADMIN-ONLY WHILE SALES-ORDER CHECKOUT IS OFF. Jacob's call, 26 August: the
// buy flow is not open to customers until the refactor lands, so the route that
// creates a sales order takes requireAdmin rather than requireUser. It is the
// route the customer checkout posts to, so a customer now gets 403 there - that
// is the intent, not a regression.
//
// Deliberately NOT deleted and NOT merged into admin_create_sales_order: those
// take different bodies and different controllers, and reopening the flow should
// be a one-word change here rather than a re-implementation.
router.post("/create_sales_order", requireAdmin, createSalesOrder);

// user
router.get("/get_sales_orders", requireUser, getSalesOrders);
router.post("/get_order_metals", requireUser, requireOwnOrder, getOrderMetals);
router.post("/create_review", requireUser, requireOwnOrder, createReview);

// admin
router.get("/get_all", requireAdmin, getAllSalesOrders);
// NO MUTATIONS HERE ANY MORE - every order write lives under /api/orders, one
// namespace for both directions (Jacob, 28 August; the endpoint table is in
// features/orders/patch.service.ts). These reads stay for this series and
// move to /api/orders reads in the read-pivot wave.
router.post("/admin_create_sales_order", requireAdmin, adminCreateSalesOrder);

export default router;
