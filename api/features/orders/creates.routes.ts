// THE TWO LEGACY CREATE NAMESPACES: /api/purchase_orders and /api/sales_orders.
//
// Was features/purchase-orders/routes.ts and features/sales-orders/routes.ts.
// Those features are gone - direction is a COLUMN - but THE PATHS DO NOT
// CHANGE (ruling 13: the URL and the file answer different questions), so this
// file declares both routers and app.js mounts each where it always did.
//
// WHAT IS LEFT HERE IS CREATION, the review flag, and the purge. The reads
// left with the read-flip wave and the mutations left with D87: the lists are
// GET /api/orders, the spots GET /api/orders/:id/spots, the refiner spots
// GET /api/refiners/orders/:id/spots, the bank details
// GET /api/payouts/:id/details, and every order mutation is
// PATCH /api/orders/:id.
//
// D102 NAMES THESE AS THE NEXT THING TO GO: the creates are what checkout
// calls, and unifying them is checkout's own work rather than this file's.
// Until then the two namespaces survive as the create surface.
import express from "express";

import {
  createPurchaseOrder,
  createSalesOrder,
  adminCreateSalesOrder,
  createPurchaseReview,
  createSalesReview,
  purgeCancelled,
} from "#features/orders/controller.ts";

import { requireUser, requireAdmin } from "#shared/middleware/authMiddleware.ts";
// requireUser asks whether somebody is signed in; this asks whether the order
// is theirs. It reads the order id out of the request BODY, which is where
// every POST below carries it. Until it existed a customer could act on any
// order whose id they had.
import { requireOwnOrder } from "#shared/middleware/ownership.ts";

// ------------------------------------------------- /api/purchase_orders
export const purchaseOrderRoutes = express.Router();

purchaseOrderRoutes.post("/create_purchase_order", requireUser, createPurchaseOrder);
purchaseOrderRoutes.post("/create_review", requireUser, requireOwnOrder, createPurchaseReview);

// admin
purchaseOrderRoutes.delete("/purge_cancelled", requireAdmin, purgeCancelled);

// ---------------------------------------------------- /api/sales_orders
export const salesOrderRoutes = express.Router();

// ADMIN-ONLY WHILE SALES-ORDER CHECKOUT IS OFF. Jacob's call, 26 August: the
// buy flow is not open to customers until the refactor lands, so the route that
// creates a sales order takes requireAdmin rather than requireUser. It is the
// route the customer checkout posts to, so a customer now gets 403 there - that
// is the intent, not a regression.
//
// Deliberately NOT deleted and NOT merged into admin_create_sales_order: those
// take different bodies and different controllers, and reopening the flow should
// be a one-word change here rather than a re-implementation.
salesOrderRoutes.post("/create_sales_order", requireAdmin, createSalesOrder);

salesOrderRoutes.post("/create_review", requireUser, requireOwnOrder, createSalesReview);

// admin
salesOrderRoutes.post("/admin_create_sales_order", requireAdmin, adminCreateSalesOrder);
