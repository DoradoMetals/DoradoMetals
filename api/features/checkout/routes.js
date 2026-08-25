import express from "express";

import {
  getCart,
  syncCart,
  getSellCart,
  syncSellCart,
} from "#features/checkout/controller.js";

import { requireUser } from "#shared/middleware/authMiddleware.js";

const router = express.Router();

// Guarded, where they used to be public. A cart is browser-local until somebody
// signs in; once it is on the server it belongs to an account, and the account
// is the session's - see the controller for what these answered before.
router.get("/get_cart", requireUser, getCart);
router.post("/sync_cart", requireUser, syncCart);
router.get("/get_sell_cart", requireUser, getSellCart);
router.post("/sync_sell_cart", requireUser, syncSellCart);

export default router;
