import express from "express";

import {
  listOrders,
  patchOrder,
  putOrderSpots,
  createOrderItem,
  getOrderSpots,
  getOrderItems,
  getOrderAddress,
} from "#features/orders/controller.ts";
import {
  patchOrderItem,
  deleteOrderItem,
} from "#features/orders/items/controller.ts";
import {
  getRefinerOrderByOrder,
  getRefinerSpotsByOrder,
  getRefinerItemsByOrder,
} from "#features/refiners/orders/controller.ts";
import {
  getFulfillmentByOrder,
  getPickupsByOrder,
  getDirectsByOrder,
} from "#features/fulfillments/controller.ts";
import { getShipmentsByOrder } from "#features/shipping/shipments/controller.ts";
import { getPayoutsByOrder } from "#features/payouts/controller.ts";
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

// The order's LINES, same guard and same reasoning: a customer's own drawer
// renders them, so this is owner-or-admin rather than admin-only. VERBATIM
// orders.items rows - the composed order's order_items[], with its embedded
// scrap and product objects and its derived item_type, died with the wire
// slim (Jacob: "That was the whole point of combining scrap/bullion into just
// items").
router.get("/:id/items", requireUser, requireOwnOrderParam, getOrderItems);

// The address SNAPSHOT the parcel went to. Owner-or-admin: a customer reads
// their own delivery address on their own order, which is the one piece of
// the old `address` slot they were ever shown.
router.get("/:id/address", requireUser, requireOwnOrderParam, getOrderAddress);

// READS RESOLVE FROM THE PARENT PATH, WRITES KEY BY THE RESOURCE'S OWN ID
// (Jacob's route convention, wave 2). These paths live under /orders because
// the ORDER ID is the key the caller holds; the handlers belong to the
// features that own the tables - fulfillments owns the chain, refiners owns
// the engagement - and the writes those reads feed (PATCH /refiners/orders/:id)
// keep the resource's own id, which the reads serve.
//
//   /:orderId/fulfillments    the fulfillments.fulfillments row, verbatim
//   /:orderId/shipments       shipping.shipments rows, BOTH directions in one
//                             array - the frontend filters on `direction`,
//                             which is what retires the shipment /
//                             return_shipment slot naming
//   /:orderId/pickups         fulfillments.pickups rows (us collecting)
//   /:orderId/directs         fulfillments.directs rows (a customer visiting)
//   /:orderId/payouts         the payout rows, LAST FOUR ONLY - ruling 12's
//                             one deviation class, security
//   /:orderId/refiners        the engagement row - refiners.orders, verbatim
//   /:orderId/refiners/spots  the refinery's quoted spots, verbatim rows
router.get("/:orderId/fulfillments", requireAdmin, getFulfillmentByOrder);
router.get("/:orderId/shipments", requireUser, requireOwnOrderParam, getShipmentsByOrder);
router.get("/:orderId/pickups", requireAdmin, getPickupsByOrder);
router.get("/:orderId/directs", requireAdmin, getDirectsByOrder);
router.get("/:orderId/payouts", requireUser, requireOwnOrderParam, getPayoutsByOrder);
router.get("/:orderId/refiners", requireAdmin, getRefinerOrderByOrder);
router.get("/:orderId/refiners/spots", requireAdmin, getRefinerSpotsByOrder);
router.get("/:orderId/refiners/items", requireAdmin, getRefinerItemsByOrder);

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
