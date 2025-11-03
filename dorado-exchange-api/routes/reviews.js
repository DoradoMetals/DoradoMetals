import express from "express";

import { requireAdmin } from "../middleware/authMiddleware.js";
import {
  getOne,
  getAll,
  createReview,
  updateReview,
  deleteReview,
  getPublic,
} from "../controllers/reviewsController.js";

const router = express.Router();

router.get("/get_one", requireAdmin, getOne);
router.get("/get_all", requireAdmin, getAll);
router.get("/get_public", getPublic);
router.post("/create", requireAdmin, createReview);
router.post("/update", requireAdmin, updateReview);
router.delete("/delete", requireAdmin, deleteReview);

export default router;
