import express from "express";

import {
  listOrders,
  patchOrder,
  putOrderSpots,
  createOrderItem,
} from "#features/orders/controller.ts";
import {
  patchOrderItem,
  deleteOrderItem,
} from "#features/orders/items/controller.ts";
import { requireUser, requireAdmin } from "#shared/middleware/authMiddleware.ts";

const router = express.Router();

// The unified list read: owners their own, admins everything, ?direction=
// and (admins) ?user_id= narrowing. The remaining legacy reads move here in
// the read-pivot wave once the feature-data verification clears their
// deletion; this one leads because the frontend already consumes it.
router.get("/", requireUser, listOrders);

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
