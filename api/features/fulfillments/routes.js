import express from "express";

import {
  cancelSchedule,
  getAllMethods,
  getForOrder,
  getMethods,
  getSchedule,
  scheduleDirect,
  schedulePickup,
  setMethod,
  setStatus,
  updateMethod,
} from "#features/fulfillments/controller.js";

import {
  requireAdmin,
  requireUser,
} from "#shared/middleware/authMiddleware.js";

const router = express.Router();

// No wire adapter. Every other feature has one because the frontend already
// consumes an older shape of the same data; nothing consumes these endpoints
// yet, so there is no legacy shape to be compatible with and the honest shape
// is the only one. The day the frontend's intake step stops hardcoding
// PICKUP / OFFICE_VISIT / MAIL_IN and reads /methods instead, it reads this.

router.get("/methods", requireUser, getMethods);
router.get("/methods/all", requireAdmin, getAllMethods);
router.post("/methods/update", requireAdmin, updateMethod);

router.get("/get_for_order", requireUser, getForOrder);
router.get("/schedule", requireAdmin, getSchedule);

router.post("/schedule_pickup", requireAdmin, schedulePickup);
router.post("/schedule_direct", requireAdmin, scheduleDirect);
router.post("/cancel_schedule", requireAdmin, cancelSchedule);
router.post("/set_method", requireAdmin, setMethod);
router.post("/set_status", requireAdmin, setStatus);

export default router;
