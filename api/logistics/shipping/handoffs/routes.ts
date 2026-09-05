import express from "express";

import { getAll } from "#logistics/shipping/handoffs/controller.ts";
import { requireUser } from "#shared/middleware/authMiddleware.ts";

const router = express.Router();

router.get("/", requireUser, getAll);

export default router;
