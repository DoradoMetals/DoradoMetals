import express from "express";

import { scheduleDirect } from "#transport/fulfillments/directs/controller.ts";
import { requireAdmin } from "#shared/middleware/authMiddleware.ts";

// Mounted at / by transport/fulfillments/routes.ts: POST /api/fulfillments/schedule_direct, unchanged.
const router = express.Router();

router.post("/schedule_direct", requireAdmin, scheduleDirect);

export default router;
