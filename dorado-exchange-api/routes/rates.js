import express from "express";
import { requireAdmin } from "../middleware/authMiddleware.js";
import {
  getOne,
  getAll,
  createRate,
  updateRate,
  deleteRate,
  getAdmin,
} from "../controllers/rateController.js";

const router = express.Router();

router.get("/get_one", requireAdmin, getOne);
router.get("/get_all", getAll);
router.get("/get_admin", requireAdmin, getAdmin)
router.post("/create", requireAdmin, createRate);
router.post("/update", requireAdmin, updateRate);
router.delete("/delete", requireAdmin, deleteRate);

export default router;