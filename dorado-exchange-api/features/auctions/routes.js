import express from "express";

import {
  getAll,
  getOne,
  create,
  update,
  remove,
} from "#features/auctions/controller.js";

import { requireAdmin } from "#shared/middleware/authMiddleware.js";

const router = express.Router();

router.get("/get", requireAdmin, getAll);
router.get("/one", requireAdmin, getOne);
router.post("/create", requireAdmin, create);
router.post("/update", requireAdmin, update);
router.delete("/delete", requireAdmin, remove);

export default router;
