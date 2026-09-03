import express from "express";

import { getOffered } from "#transport/shipping/packages/controller.ts";
import { requireUser } from "#shared/middleware/authMiddleware.ts";

// Mounted by transport/shipping/routes.ts at /packages, so the path is GET /api/shipping/packages. requireUser - the box menu is checkout's.
const router = express.Router();

router.get("/", requireUser, getOffered);

export default router;
