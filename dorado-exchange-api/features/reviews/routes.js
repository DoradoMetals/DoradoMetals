import express from "express";

import {
  getOne,
  getAll,
  createReview,
  updateReview,
  deleteReview,
  getPublic,
} from "#features/reviews/controller.js";

import { requireAdmin } from "#shared/middleware/authMiddleware.js";

const router = express.Router();

router.get("/get_one", requireAdmin, getOne);
router.get("/get_all", requireAdmin, getAll);
router.get("/get_public", getPublic);
router.post("/create", requireAdmin, createReview);
router.post("/update", requireAdmin, updateReview);
router.delete("/delete", requireAdmin, deleteReview);

export default router;
