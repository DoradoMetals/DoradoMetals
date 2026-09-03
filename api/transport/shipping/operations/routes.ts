import express from "express";

import {
  cancelLabel,
  cancelPickup,
  checkPickup,
  getLocations,
  getRates,
  getTracking,
  validateAddress,
} from "#transport/shipping/operations/controller.ts";

import {
  requireUser,
  requireAdmin,
} from "#shared/middleware/authMiddleware.ts";
import { requireOwnShipment } from "#shared/middleware/ownership.ts";

const router = express.Router();

router.post("/validate_address", requireUser, validateAddress);
router.post("/get_rates", requireUser, getRates);
router.post("/get_locations", requireUser, getLocations);
router.post("/check_pickup", requireUser, checkPickup);
router.post("/get_tracking", requireUser, requireOwnShipment, getTracking);

router.post("/cancel_label", requireAdmin, cancelLabel);
router.post("/cancel_pickup", requireAdmin, cancelPickup);

export default router;
