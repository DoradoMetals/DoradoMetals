import express from "express";

import {
  cancelLabel,
  cancelPickup,
  checkPickup,
  getLocations,
  getRates,
  getTracking,
  validateAddress,
} from "#features/shipping/operations/controller.js";

import {
  requireUser,
  requireAdmin,
} from "#shared/middleware/authMiddleware.js";

const router = express.Router();

router.post("/validate_address", requireUser, validateAddress);
router.post("/get_rates", requireUser, getRates);
router.post("/get_locations", requireUser, getLocations);
router.post("/check_pickup", requireUser, checkPickup);
router.post("/get_tracking", requireUser, getTracking);

router.post("/cancel_label", requireAdmin, cancelLabel);
router.post("/cancel_pickup", requireAdmin, cancelPickup);

export default router;
