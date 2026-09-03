import express from "express";

import { getAll } from "#transport/shipping/handoffs/controller.ts";
import { requireUser } from "#shared/middleware/authMiddleware.ts";

// Mounted by features/shipping/routes.ts at /handoffs, so the path is
// GET /api/shipping/handoffs. requireUser, matching every other read on this
// feature - checkout is behind a session.
const router = express.Router();

router.get("/", requireUser, getAll);

export default router;
