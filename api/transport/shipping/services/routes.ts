import express from "express";

import {
  create,
  getAll,
  getOne,
  getByCarrier,
  getOffered,
  getSaleOptions,
  remove,
  update,
} from "#transport/shipping/services/controller.ts";

import {
  requireAdmin,
  requireUser,
} from "#shared/middleware/authMiddleware.ts";

const router = express.Router();

router.get("/sale_options", getSaleOptions);

router.get("/get", requireUser, getAll);
router.get("/get_by_carrier", requireUser, getByCarrier);
router.get("/offered", requireUser, getOffered);

router.get("/get_one", requireAdmin, getOne);
router.post("/create", requireAdmin, create);
router.post("/update", requireAdmin, update);
router.delete("/delete", requireAdmin, remove);

export default router;
