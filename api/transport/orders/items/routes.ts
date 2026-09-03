import express from "express";

import {
  createOrderItem,
  deleteOrderItem,
  getOrderItems,
  patchOrderItem,
} from "#transport/orders/items/controller.ts";

import { requireUser, requireAdmin } from "#shared/middleware/authMiddleware.ts";
import { requireOwnOrderParam } from "#shared/middleware/ownership.ts";

// MOUNTED AT / BY features/orders/routes.ts. The live paths are unchanged
// (ruling 13):
//
//   GET    /api/orders/:id/items
//   POST   /api/orders/:id/items
//   PATCH  /api/orders/items/:id
//   DELETE /api/orders/items/:id
//
// THE TWO LINE-KEYED ROUTES ARE DECLARED FIRST so their extra literal segment
// can never be read as an order id; Express matches in order, and the parent
// mounts this router before its own /:id routes for the same reason.
const router = express.Router();

router.patch("/items/:id", requireAdmin, patchOrderItem);
router.delete("/items/:id", requireAdmin, deleteOrderItem);

// Owner-or-admin: a customer's own drawer renders their lines.
router.get("/:id/items", requireUser, requireOwnOrderParam, getOrderItems);
router.post("/:id/items", requireAdmin, createOrderItem);

export default router;
