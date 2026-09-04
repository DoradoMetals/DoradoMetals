import express from "express";

import {
  buyShipmentLabel, getShipment, patchShipment,
} from "#transport/shipping/shipments/controller.ts";
import { requireAdmin, requireUser } from "#shared/middleware/authMiddleware.ts";
import { requireOwnShipment } from "#shared/middleware/ownership.ts";

const router = express.Router();

router.get("/:id", requireUser, requireOwnShipment, getShipment);

router.patch("/:id", requireAdmin, patchShipment);

router.post("/:id/label", requireAdmin, buyShipmentLabel);

export default router;
