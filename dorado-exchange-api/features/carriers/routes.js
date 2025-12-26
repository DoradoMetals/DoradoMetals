import express from "express";

import { getAll } from "#features/carriers/controller.js";

import { requireAdmin } from "#shared/middleware/authMiddleware.js";

const router = express.Router();

router.get("/get_all", requireAdmin, getAll);

export default router;
