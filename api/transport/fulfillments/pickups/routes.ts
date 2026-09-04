import express from "express";

import { schedulePickup } from "#transport/fulfillments/pickups/controller.ts";
import { requireAdmin } from "#shared/middleware/authMiddleware.ts";

const router = express.Router();

router.post("/schedule_pickup", requireAdmin, schedulePickup);

export default router;
