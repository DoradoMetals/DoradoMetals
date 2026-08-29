import express from "express";

import { listOrders, patchOrder } from "#features/orders/controller.ts";

// EVERY SUB-RESOURCE DECLARES ITS OWN PATHS; THIS FILE MOUNTS THEM (ruling
// 26c). The URLs do not change - ruling 13, the URL and the file answer
// different questions - so what moved is which file you open to find a
// handler, not what a client calls.
import itemRoutes from "#features/orders/items/routes.ts";
import spotRoutes from "#features/orders/spots/routes.ts";
import addressRoutes from "#features/orders/addresses/routes.ts";

// ORDER-SCOPED READS OWNED BY OTHER FEATURES. Reads resolve from the parent
// path because the ORDER ID is the key the caller holds; the handler belongs
// to the feature that owns the table (ruling 13's by-order convention), and
// the writes those reads feed keep the resource's own id.
import { getRefinerOrderByOrder } from "#features/refiners/orders/controller.ts";
import { getRefinerItemsByOrder } from "#features/refiners/items/controller.ts";
import { getRefinerSpotsByOrder } from "#features/refiners/spots/controller.ts";
import { getFulfillmentByOrder } from "#features/fulfillments/controller.ts";
import { getPickupsByOrder } from "#features/fulfillments/pickups/controller.ts";
import { getDirectsByOrder } from "#features/fulfillments/directs/controller.ts";
import { getShipmentsByOrder } from "#features/shipping/shipments/controller.ts";
import { getPayoutsByOrder } from "#features/payouts/controller.ts";

import { requireUser, requireAdmin } from "#shared/middleware/authMiddleware.ts";
import { requireOwnOrderParam } from "#shared/middleware/ownership.ts";

const router = express.Router();

// The unified list read: owners their own, admins everything, ?direction=
// and (admins) ?user_id= narrowing.
router.get("/", requireUser, listOrders);

// THE SUB-RESOURCES, MOUNTED FIRST. Items goes first because its two
// line-keyed routes carry a literal segment (/items/:id) that must be matched
// before this file's own /:id; Express matches in order.
//
//   items      GET/POST /:id/items, PATCH/DELETE /items/:id
//   spots      GET/PUT  /:id/spots
//   addresses  GET      /:id/address
router.use("/", itemRoutes);
router.use("/", spotRoutes);
router.use("/", addressRoutes);

//   /:orderId/fulfillments    the fulfillments.fulfillments row, verbatim
//   /:orderId/shipments       shipping.shipments rows, BOTH directions in one
//                             array - the frontend filters on `direction`,
//                             which is what retires the shipment /
//                             return_shipment slot naming
//   /:orderId/pickups         fulfillments.pickups rows (DORADO collecting -
//                             not a carrier pickup, which is a property of a
//                             shipment)
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

// THE ORDER ROW ITSELF, and only it (Jacob, 28 August): the status label and
// the order-level operations. /purchase_orders and /sales_orders were legacy
// route vocabulary, the same way the schema unified into orders.orders with a
// direction column. Direction is DATA - the patch service validates each
// operation against the order's direction rather than the URL. Admin-only:
// customers have no order-management surface today.
router.patch("/:id", requireAdmin, patchOrder);

export default router;
