import express from "express";

import { patchRefinerOrder } from "#features/refiners/orders/controller.ts";
import { requireAdmin } from "#shared/middleware/authMiddleware.ts";

const router = express.Router();

// The refiner ENGAGEMENT on a customer order - refiners.orders (093): the
// refinery's spots, the pool values, the fee, and which refinery has the
// metal. Admin-only; addressed by the engagement's own id, which the order
// wire surfaces per order once the migration lands.
//
// NEEDS MIGRATION 093 APPLIED - the table this addresses does not exist
// before it, and the route answers 500 rather than pretending.
router.patch("/orders/:id", requireAdmin, patchRefinerOrder);

// THE READS LIVE UNDER /api/orders (Jacob's route convention: reads resolve
// from the PARENT path, writes key by the resource's own id) - see
// features/orders/routes.ts, which mounts GET /orders/:orderId/refiners and
// /orders/:orderId/refiners/spots with THIS feature's handlers. The write
// above keeps the engagement's own id, which those reads serve.

export default router;
