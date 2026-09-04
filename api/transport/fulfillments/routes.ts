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
import { getFulfillmentRates } from "#transport/shipping/operations/controller.ts";

import methodRoutes from "#transport/fulfillments/methods/routes.ts";
import pickupRoutes from "#transport/fulfillments/pickups/routes.ts";
import directRoutes from "#transport/fulfillments/directs/routes.ts";

import { requireAdmin, requireUser } from "#shared/middleware/authMiddleware.ts";

const router = express.Router();

router.use("/methods", methodRoutes);
router.use("/", pickupRoutes);
router.use("/", directRoutes);

router.get("/schedule", requireAdmin, getSchedule);

router.post("/cancel_schedule", requireAdmin, cancelSchedule);
router.post("/set_method", requireAdmin, setMethod);
router.post("/set_status", requireAdmin, setStatus);

router.post("/", requireUser, createFulfillment);
router.get("/:id", requireUser, getFulfillment);
router.get("/:id/rates", requireUser, getFulfillmentRates);
router.patch("/:id", requireUser, patchFulfillment);

export default router;
