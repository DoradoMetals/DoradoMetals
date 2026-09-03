import express from "express";

import { patchShipment, getPickupsByShipment } from "#transport/shipping/shipments/controller.ts";
import { requireAdmin } from "#shared/middleware/authMiddleware.ts";

const router = express.Router();

// A PARCEL's money and tracking, addressed by the shipment id the order wire
// serves (order.shipment.id). Admin-only - these figures decide what the
// business paid to move metal and what the customer is told about it.
router.patch("/:id", requireAdmin, patchShipment);

// The carrier pickups booked against this parcel - the shipment is their
// parent (shipping.pickups.shipment_id), so this is where they are
// addressed. Admin-only: a pickup booking is operational.
router.get("/:id/pickups", requireAdmin, getPickupsByShipment);

export default router;
