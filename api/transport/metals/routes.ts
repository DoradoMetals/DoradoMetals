import express from "express";
import { listMetals } from "#transport/metals/controller.ts";
import { requireAdmin } from "#shared/middleware/authMiddleware.ts";

const router = express.Router();

router.get("/", requireAdmin, listMetals);

export default router;
