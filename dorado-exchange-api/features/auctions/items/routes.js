import express from "express";

import {
  getAll,
  create,
  update,
  remove,
  getByAuction,
  createLots,
  move,
  reorder,
  removeMany,
} from "#features/auctions/items/controller.js";

import { requireAdmin } from "#shared/middleware/authMiddleware.js";

const router = express.Router();

router.get("/get", requireAdmin, getByAuction);
router.get("/get_all", requireAdmin, getAll);
router.post("/create", requireAdmin, create);
router.post("/create_lots", requireAdmin, createLots);
router.post("/update", requireAdmin, update);
router.delete("/delete", requireAdmin, remove);
router.post("/move", requireAdmin, move);
router.post("/reorder", requireAdmin, reorder);
router.post("/delete_many", requireAdmin, removeMany);

export default router;
