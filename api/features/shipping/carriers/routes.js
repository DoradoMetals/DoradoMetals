import express from "express";

import {
  create,
  getAll,
  getOne,
  remove,
  update,
} from "#features/shipping/carriers/controller.js";

import {
  requireAdmin,
  requireUser,
} from "#shared/middleware/authMiddleware.js";

import * as carriersWire from "#features/shipping/carriers/wire.ts";
import { wireShape } from "#shared/wire/middleware.ts";

const router = express.Router();

// The wire adapter, mounted once for the whole feature rather than called by
// hand in every handler - writes arrive as { carrier }. Controllers return the internal shape
// and know nothing about the frontend not having caught up. Deleting the
// adapter is deleting this line.
router.use(wireShape(carriersWire, { body: "carrier" }));

router.get("/get", requireUser, getAll);

router.get("/get_one", requireAdmin, getOne);
router.post("/create", requireAdmin, create);
router.post("/update", requireAdmin, update);
router.delete("/delete", requireAdmin, remove);

export default router;
