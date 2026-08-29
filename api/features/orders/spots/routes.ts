import express from "express";

import {
  getOrderSpots,
  putOrderSpots,
} from "#features/orders/spots/controller.ts";

import { requireUser, requireAdmin } from "#shared/middleware/authMiddleware.ts";
import { requireOwnOrderParam } from "#shared/middleware/ownership.ts";

// MOUNTED AT / BY features/orders/routes.ts, so the live paths are unchanged
// (ruling 13): GET and PUT /api/orders/:id/spots. The order id stays in the
// path because it is the key the caller holds; what moved is which file
// declares it.
const router = express.Router();

// Owner-or-admin: requireOwnOrderParam reads the id from the path, admins
// administer every order, and a customer asking about somebody else's order
// gets the same answer as for an order that does not exist.
router.get("/:id/spots", requireUser, requireOwnOrderParam, getOrderSpots);

// Admin-only, like every order mutation: customers have no order-management
// surface (ruling 3).
router.put("/:id/spots", requireAdmin, putOrderSpots);

export default router;
