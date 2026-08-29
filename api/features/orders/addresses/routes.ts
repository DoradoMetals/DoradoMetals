import express from "express";

import { getOrderAddress } from "#features/orders/addresses/controller.ts";
import { requireUser } from "#shared/middleware/authMiddleware.ts";
import { requireOwnOrderParam } from "#shared/middleware/ownership.ts";

// MOUNTED AT / BY features/orders/routes.ts: GET /api/orders/:id/address,
// unchanged (ruling 13).
//
// Owner-or-admin: a customer reads their own delivery address on their own
// order, which is the one piece of the old `address` slot they were ever shown.
const router = express.Router();

router.get("/:id/address", requireUser, requireOwnOrderParam, getOrderAddress);

export default router;
