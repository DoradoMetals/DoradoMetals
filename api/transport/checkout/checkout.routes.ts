import express from "express";

import {
  getCheckout,
  patchCheckout,
  saveCheckoutPayout,
  getCheckoutItems,
  putCheckoutItems,
  deleteCheckoutItems,
} from "#transport/checkout/controller.ts";
import { requireUser } from "#shared/middleware/authMiddleware.ts";

// The checkout session: the row the stepper fills in, and the basket.
//
// TWO PATHS LEFT WITH THE HANDOVER (rulings 69/70). POST /checkout/fulfillment
// is POST /api/fulfillments, and GET /checkout/rates is
// GET /api/fulfillments/:id/rates - both declared by the feature that owns the
// parcel facts they read.
const router = express.Router();

router.get("/", requireUser, getCheckout);
router.get("/items", requireUser, getCheckoutItems);
router.put("/items", requireUser, putCheckoutItems);
router.delete("/items", requireUser, deleteCheckoutItems);
router.patch("/", requireUser, patchCheckout);
router.post("/payout", requireUser, saveCheckoutPayout);

export default router;
