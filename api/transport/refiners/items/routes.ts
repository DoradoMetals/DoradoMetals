import express from "express";

import { patchRefinerItem } from "#transport/refiners/items/controller.ts";
import { requireAdmin } from "#shared/middleware/authMiddleware.ts";

const router = express.Router();

// The refinery's numbers for one customer LINE: its premium and its assay
// report. Admin-only like every refiner-side figure - these decide what the
// refinery is paid against what the customer was offered.
//
// BY ORDER ITEM ID, and the path says so. The order reads serve the refiner
// values ON the item and never expose refiners.items' own row id, so the
// line's id is the only key the client honestly holds.
router.patch("/items/by-order-item/:orderItemId", requireAdmin, patchRefinerItem);

export default router;
