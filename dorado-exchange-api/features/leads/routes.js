import express from "express";

import {
  getOne,
  getAll,
  createLead,
  updateLead,
  deleteLead,
} from "#features/leads/controller.js";

import { requireAdmin } from "#shared/middleware/authMiddleware.js";

const router = express.Router();

router.get("/get_one", requireAdmin, getOne);
router.get("/get_all", requireAdmin, getAll);
router.post("/create", requireAdmin, createLead);
router.post("/update", requireAdmin, updateLead);
router.delete("/delete", requireAdmin, deleteLead);

export default router;
