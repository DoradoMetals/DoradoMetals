import express from "express";

import { getOffered } from "#logistics/shipping/packages/controller.ts";
import { requireUser } from "#shared/middleware/authMiddleware.ts";

const router = express.Router();

router.get("/", requireUser, getOffered);

export default router;
