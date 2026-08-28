import express from "express";

import {
  create,
  getAll,
  getOne,
  remove,
  update,
} from "#features/shipping/carriers/controller.ts";

import {
  requireAdmin,
  requireUser,
} from "#shared/middleware/authMiddleware.ts";

const router = express.Router();

// NO WIRE ADAPTER. Carriers is the fourth CONVERTED feature and the first
// STRUCTURAL one (2026-08-27): the frontend reads the nested organization
// from @dorado/contracts and writes it back the same way, so the lift that
// flattened it is gone. Refiners and addresses still carry theirs - the same
// makeLiftAdapter declaration - until each converts.

router.get("/get", requireUser, getAll);

router.get("/get_one", requireAdmin, getOne);
router.post("/create", requireAdmin, create);
router.post("/update", requireAdmin, update);
router.delete("/delete", requireAdmin, remove);

export default router;
