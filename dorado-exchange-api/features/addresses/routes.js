import express from "express";

import {
  getAll,
  create,
  update,
  remove,
  setDefault,
} from "#features/addresses/controller.js";

import { requireUser } from "#shared/middleware/authMiddleware.js";

const router = express.Router();

router.get("/get", requireUser, getAll);
router.post("/create", requireUser, create);
router.post("/update", requireUser, update);
router.delete("/delete", requireUser, remove);
router.post("/set_default", requireUser, setDefault);

export default router;
