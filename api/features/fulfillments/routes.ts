import express from "express";

import {
  cancelSchedule,
  getForOrder,
  getSchedule,
  setMethod,
  setStatus,
} from "#features/fulfillments/controller.ts";

import methodRoutes from "#features/fulfillments/methods/routes.ts";
import pickupRoutes from "#features/fulfillments/pickups/routes.ts";
import directRoutes from "#features/fulfillments/directs/routes.ts";

import {
  requireAdmin,
  requireUser,
} from "#shared/middleware/authMiddleware.ts";

const router = express.Router();

// THE PARENT MOUNTS, IT DOES NOT DECLARE (ruling 26c). Every sub-resource
// declares its own paths in its own routes.ts; this file's job is to say where
// they hang. THE URLS ARE UNCHANGED - ruling 13: the URL and the file answer
// different questions, and factoring the file is not a reason to move the URL.
//
//   /methods, /methods/all, /methods/update   fulfillments/methods
//   /schedule_pickup                          fulfillments/pickups
//   /schedule_direct                          fulfillments/directs
router.use("/methods", methodRoutes);
router.use("/", pickupRoutes);
router.use("/", directRoutes);

// WHAT SPANS CHILDREN STAYS HERE, and nothing else does. get_for_order and
// schedule branch across pickups/directs/shipments; cancel_schedule clears
// whichever booking existed; set_method moves between categories and deletes
// the detail row of the one being left; set_status is the fulfillment's own.
router.get("/get_for_order", requireUser, getForOrder);
router.get("/schedule", requireAdmin, getSchedule);

router.post("/cancel_schedule", requireAdmin, cancelSchedule);
router.post("/set_method", requireAdmin, setMethod);
router.post("/set_status", requireAdmin, setStatus);

export default router;
