import express from "express";

import { patchShipment } from "#features/shipping/shipments/controller.ts";
import { requireAdmin } from "#shared/middleware/authMiddleware.ts";

const router = express.Router();

// A PARCEL's money and tracking, addressed by the shipment id the order wire
// serves (order.shipment.id). Admin-only - these figures decide what the
// business paid to move metal and what the customer is told about it.
router.patch("/:id", requireAdmin, patchShipment);

export default router;
