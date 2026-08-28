import express from "express";
import {
  createSalesOrder,
  adminCreateSalesOrder,
  createReview,
} from "#features/sales-orders/controller.ts";

import {
  requireUser,
  requireAdmin,
} from "#shared/middleware/authMiddleware.ts";
// See features/purchase-orders/routes.ts: requireUser asks whether somebody is
// signed in, this asks whether the order is theirs.
import { requireOwnOrder } from "#shared/middleware/ownership.ts";

const router = express.Router();

// CREATES AND THE REVIEW ONLY. The reads left with the read-flip wave the way
// the mutations left with D87: the lists live at GET /api/orders and the spots
// at GET /api/orders/:id/spots - one namespace, both directions.

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

router.post("/create_review", requireUser, requireOwnOrder, createReview);

// admin
router.post("/admin_create_sales_order", requireAdmin, adminCreateSalesOrder);

export default router;
