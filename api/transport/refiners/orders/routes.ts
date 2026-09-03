import express from "express";

import { patchRefinerOrder } from "#transport/refiners/orders/controller.ts";
import { requireAdmin } from "#shared/middleware/authMiddleware.ts";

const router = express.Router();

// The refiner ENGAGEMENT on a customer order — refiners.orders: the refinery's spots, pool values, fee, and which refinery has the metal. Admin-only; addressed by the engagement's own id.
router.patch("/orders/:id", requireAdmin, patchRefinerOrder);

// The reads live under /api/orders (reads resolve from the parent path, writes key by the resource's own id) — features/orders/routes.ts mounts GET /orders/:orderId/refiners and .../refiners/spots with this feature's handlers.

export default router;
