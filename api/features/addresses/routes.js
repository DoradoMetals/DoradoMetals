import express from "express";

import {
  getAll,
  create,
  update,
  remove,
  setDefault,
} from "#features/addresses/controller.ts";

import { requireUser } from "#shared/middleware/authMiddleware.js";
import * as addressesWire from "#features/addresses/wire.ts";
import { wireShape } from "#shared/wire/middleware.ts";

const router = express.Router();

// The wire adapter, mounted once for the whole feature rather than called by
// hand in every handler - writes arrive as { address, user_id }. Controllers return the internal shape
// and know nothing about the frontend not having caught up. Deleting the
// adapter is deleting this line.
router.use(wireShape(addressesWire, { body: "address" }));

router.get("/get", requireUser, getAll);
router.post("/create", requireUser, create);
router.post("/update", requireUser, update);
router.delete("/delete", requireUser, remove);
router.post("/set_default", requireUser, setDefault);

export default router;
