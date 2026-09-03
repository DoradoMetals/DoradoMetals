import express from "express";

import {
  getCheckout,
  patchCheckout,
  setCheckoutFulfillment,
  saveCheckoutPayout,
  getCheckoutItems,
  putCheckoutItems,
  deleteCheckoutItems,
} from "#transport/checkout/controller.ts";
// Declared here (the checkout router); handled in shipping, which owns the
// carrier call.
import { getCheckoutRates } from "#transport/shipping/operations/controller.ts";
import { requireUser } from "#shared/middleware/authMiddleware.ts";

// The checkout session: the row the stepper fills in, and the basket.
const router = express.Router();

router.get("/", requireUser, getCheckout);
router.get("/rates", requireUser, getCheckoutRates);
router.get("/items", requireUser, getCheckoutItems);
router.put("/items", requireUser, putCheckoutItems);
router.delete("/items", requireUser, deleteCheckoutItems);
router.patch("/", requireUser, patchCheckout);
router.post("/fulfillment", requireUser, setCheckoutFulfillment);
router.post("/payout", requireUser, saveCheckoutPayout);

export default router;
