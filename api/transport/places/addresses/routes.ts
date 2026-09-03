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

// NO WIRE ADAPTER. Addresses converted 2026-08-27 - the LAST lift: the
// frontend reads and writes the nested user_address from @dorado/contracts,
// so the flatten is gone, and with it the last consumer of
// shared/wire/lift.ts. What stays flat is the ORDERS wire's embedded
// address and the purchase-order create/cancel bodies, which the frontend
// down-converts at its edge (features/orders/orderAddresses.ts) until
// orders converts.

router.get("/get", requireUser, getAll);
router.get("/get_user_addresses", requireUser, getUserAddresses);
router.post("/create", requireUser, create);
router.post("/update", requireUser, update);
router.delete("/delete", requireUser, remove);
router.post("/set_default", requireUser, setDefault);

export default router;
