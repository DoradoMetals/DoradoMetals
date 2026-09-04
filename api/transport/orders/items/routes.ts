import express from "express";

import {
  createOrderItem,
  deleteOrderItem,
  getOrderItems,
  patchOrderItem,
} from "#transport/orders/items/controller.ts";

import { requireUser, requireAdmin } from "#shared/middleware/authMiddleware.ts";
import { requireOwnOrderParam } from "#shared/middleware/ownership.ts";

const router = express.Router();

router.patch("/items/:id", requireAdmin, patchOrderItem);
router.delete("/items/:id", requireAdmin, deleteOrderItem);

router.get("/:id/items", requireUser, requireOwnOrderParam, getOrderItems);
router.post("/:id/items", requireAdmin, createOrderItem);

export default router;
