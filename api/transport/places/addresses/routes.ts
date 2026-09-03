import express from "express";

import {
  getAll,
  getUserAddresses,
  create,
  update,
  remove,
  setDefault,
} from "#transport/places/addresses/controller.ts";

import { requireUser } from "#shared/middleware/authMiddleware.ts";
const router = express.Router();

// No wire adapter - the frontend reads and writes the nested user_address shape directly from @dorado/contracts.

router.get("/get", requireUser, getAll);
router.get("/get_user_addresses", requireUser, getUserAddresses);
router.post("/create", requireUser, create);
router.post("/update", requireUser, update);
router.delete("/delete", requireUser, remove);
router.post("/set_default", requireUser, setDefault);

export default router;
