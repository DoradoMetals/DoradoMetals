import express from "express";

import { scheduleDirect } from "#transport/fulfillments/directs/controller.ts";
import { requireAdmin } from "#shared/middleware/authMiddleware.ts";

const router = express.Router();

router.post("/schedule_direct", requireAdmin, scheduleDirect);

export default router;
