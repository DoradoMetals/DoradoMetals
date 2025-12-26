import express from "express";
import { getTracking } from "#features/shipping/controller.js";
import { requireUser } from "#shared/middleware/authMiddleware.js";
const router = express.Router();

router.post("/get_tracking", requireUser, getTracking);

export default router;
