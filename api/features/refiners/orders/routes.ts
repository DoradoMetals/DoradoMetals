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

export default router;
