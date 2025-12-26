import express from "express";

import {
  getOne,
  getAll,
  createRate,
  updateRate,
  deleteRate,
  getAdmin,
} from "#features/rates/controller.js";

import { requireAdmin } from "#shared/middleware/authMiddleware.js";

const router = express.Router();

router.get("/get_one", requireAdmin, getOne);
router.get("/get_all", getAll);
router.get("/get_admin", requireAdmin, getAdmin);
router.post("/create", requireAdmin, createRate);
router.post("/update", requireAdmin, updateRate);
router.delete("/delete", requireAdmin, deleteRate);

export default router;
