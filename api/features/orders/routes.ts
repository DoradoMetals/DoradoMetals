import express from "express";

import {
  listOrders,
  patchOrder,
  putOrderSpots,
  createOrderItem,
  getOrderSpots,
} from "#features/orders/controller.ts";
import {
  patchOrderItem,
  deleteOrderItem,
} from "#features/orders/items/controller.ts";
import {
  getRefinerOrderByOrder,
  getRefinerSpotsByOrder,
} from "#features/refiners/orders/controller.ts";
import { getFulfillmentByOrder } from "#features/fulfillments/controller.ts";
import { requireUser, requireAdmin } from "#shared/middleware/authMiddleware.ts";
import { requireOwnOrderParam } from "#shared/middleware/ownership.ts";

const router = express.Router();

// The unified list read: owners their own, admins everything, ?direction=
// and (admins) ?user_id= narrowing. The remaining legacy reads move here in
// the read-pivot wave once the feature-data verification clears their
// deletion; this one leads because the frontend already consumes it.
router.get("/", requireUser, listOrders);

// THE BARE-RESOURCE READ (rulings 9 + 12), landed with the legacy read
// routes' deletion - the flip-together rule. The order's quoted spots as
// VERBATIM orders.spots rows, one read for both directions, replacing
// get_purchase_order_metals AND get_order_metals. (The fulfillment read
// lives at GET /api/fulfillments/by-order/:orderId - the chain is
// fulfillments' resource, so its read lives on the fulfillments route.)
//
// Owner-or-admin: requireOwnOrderParam reads the id from the path, admins
// administer every order, and a customer asking about somebody else's order
// gets the same answer as for an order that does not exist.
router.get("/:id/spots", requireUser, requireOwnOrderParam, getOrderSpots);

// READS RESOLVE FROM THE PARENT PATH, WRITES KEY BY THE RESOURCE'S OWN ID
// (Jacob's route convention, wave 2). These paths live under /orders because
// the ORDER ID is the key the caller holds; the handlers belong to the
// features that own the tables - fulfillments owns the chain, refiners owns
// the engagement - and the writes those reads feed (PATCH /refiners/orders/:id)
// keep the resource's own id, which the reads serve.
//
//   /:orderId/fulfillments    the chain resolved to bare VERBATIM rows:
//                             { method, shipment?, return_shipment?, pickup? }
//   /:orderId/refiners        the engagement row - refiners.orders, verbatim
//   /:orderId/refiners/spots  the refinery's quoted spots, verbatim rows
router.get("/:orderId/fulfillments", requireAdmin, getFulfillmentByOrder);
router.get("/:orderId/refiners", requireAdmin, getRefinerOrderByOrder);
router.get("/:orderId/refiners/spots", requireAdmin, getRefinerSpotsByOrder);

// THE UNIFIED ORDER MUTATION SURFACE (Jacob, 28 August): /purchase_orders and
// /sales_orders are legacy route vocabulary, the same way the schema unified
// into orders.orders with a direction column. Direction is DATA - the patch
// service validates each operation against the order's direction rather than
// the URL. All admin-only: customers have no order-management surface today.
//
// The item routes are registered before /:id so their extra path segment can
// never be read as an order id; Express matches in order.
router.patch("/items/:id", requireAdmin, patchOrderItem);
router.delete("/items/:id", requireAdmin, deleteOrderItem);
router.patch("/:id", requireAdmin, patchOrder);
router.put("/:id/spots", requireAdmin, putOrderSpots);
router.post("/:id/items", requireAdmin, createOrderItem);

export default router;
