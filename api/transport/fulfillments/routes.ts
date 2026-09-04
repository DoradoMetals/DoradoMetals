import express from "express";

import {
  cancelSchedule,
  getSchedule,
  setMethod,
  setStatus,
} from "#transport/fulfillments/controller.ts";

import methodRoutes from "#transport/fulfillments/methods/routes.ts";
import pickupRoutes from "#transport/fulfillments/pickups/routes.ts";
import directRoutes from "#transport/fulfillments/directs/routes.ts";

import { requireAdmin } from "#shared/middleware/authMiddleware.ts";

const router = express.Router();

// The parent mounts, it does not declare: every sub-resource declares its own paths in its own routes.ts; this file says where they hang. The URLs are unchanged - factoring the file is not a reason to move the URL.
//   /methods, /methods/all, /methods/update   fulfillments/methods
//   /schedule_pickup                          fulfillments/pickups
//   /schedule_direct                          fulfillments/directs
router.use("/methods", methodRoutes);
router.use("/", pickupRoutes);
router.use("/", directRoutes);

// What spans children stays here, nothing else does: schedule branches across
// pickups and directs, cancel_schedule clears whichever booking existed,
// set_method moves categories and deletes the detail row being left,
// set_status is the fulfillment's own.
// GET /get_for_order is GONE - GET /api/orders/:orderId/fulfillments answers
// the same question about the same table from the key every caller holds.
router.get("/schedule", requireAdmin, getSchedule);

router.post("/cancel_schedule", requireAdmin, cancelSchedule);
router.post("/set_method", requireAdmin, setMethod);
router.post("/set_status", requireAdmin, setStatus);

export default router;
