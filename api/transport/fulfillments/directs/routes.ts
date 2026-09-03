import express from "express";

import { scheduleDirect } from "#transport/fulfillments/directs/controller.ts";
import { requireAdmin } from "#shared/middleware/authMiddleware.ts";

// MOUNTED AT / BY features/fulfillments/routes.ts: POST
// /api/fulfillments/schedule_direct, unchanged (ruling 13).
const router = express.Router();

router.post("/schedule_direct", requireAdmin, scheduleDirect);

export default router;
