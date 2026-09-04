import express from "express";

import { getShipment, patchShipment } from "#transport/shipping/shipments/controller.ts";
import { requireAdmin, requireUser } from "#shared/middleware/authMiddleware.ts";
import { requireOwnShipment } from "#shared/middleware/ownership.ts";

const router = express.Router();

// ONE PARCEL, WHOLE. Owner-or-admin: a customer watching their own metal move
// reads the same view the admin drawer does, minus the admin-only actions the
// view itself withholds.
router.get("/:id", requireUser, requireOwnShipment, getShipment);

// A PARCEL's money and tracking, addressed by the shipment id the order wire
// serves. Admin-only - these figures decide what the business paid to move
// metal and what the customer is told about it.
router.patch("/:id", requireAdmin, patchShipment);

// GET /:id/pickups is GONE: the carrier booking is a member of the view above
// (`carrier_pickup`), which is the only thing every caller of that endpoint
// ever read of it.

export default router;
