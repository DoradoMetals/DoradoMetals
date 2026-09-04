import express from "express";

import {
  cancelSchedule,
  createFulfillment,
  getFulfillment,
  getSchedule,
  patchFulfillment,
  setMethod,
  setStatus,
} from "#transport/fulfillments/controller.ts";
// Declared here (fulfillments owns the parcel facts a rate is quoted from);
// handled in shipping, which owns the carrier call.
import { getFulfillmentRates } from "#transport/shipping/operations/controller.ts";

import methodRoutes from "#transport/fulfillments/methods/routes.ts";
import pickupRoutes from "#transport/fulfillments/pickups/routes.ts";
import directRoutes from "#transport/fulfillments/directs/routes.ts";

import { requireAdmin, requireUser } from "#shared/middleware/authMiddleware.ts";

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

// THE CUSTOMER'S HANDOVER (rulings 69/70). Declared LAST, after every literal
// path above, because `/:id` would otherwise swallow `/schedule` and the two
// mounted children. Owner-or-admin, checked in the handler against the
// checkout that points at the draft.
router.post("/", requireUser, createFulfillment);
router.get("/:id", requireUser, getFulfillment);
router.get("/:id/rates", requireUser, getFulfillmentRates);
router.patch("/:id", requireUser, patchFulfillment);

export default router;
