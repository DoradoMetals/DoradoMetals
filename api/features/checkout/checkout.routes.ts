import express from "express";

import {
  getCheckout,
  patchCheckout,
  setCheckoutFulfillment,
  saveCheckoutPayout,
} from "#features/checkout/controller.ts";
import { requireUser } from "#shared/middleware/authMiddleware.ts";

// THE CHECKOUT ROW (D208), mounted at /api/checkout by app.ts. A separate
// router from routes.ts - that one is the cart-item sync surface and its
// mount, /api/cart, is history. This resource is minted today and gets the
// honest name.
const router = express.Router();

router.get("/", requireUser, getCheckout);
router.patch("/", requireUser, patchCheckout);
router.post("/fulfillment", requireUser, setCheckoutFulfillment);
router.post("/payout", requireUser, saveCheckoutPayout);

export default router;
