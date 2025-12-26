import express from "express";

import {
  getCart,
  syncCart,
  getSellCart,
  syncSellCart,
} from "#features/carts/controller.js";

const router = express.Router();

router.get("/get_cart", getCart);
router.post("/sync_cart", syncCart);
router.get("/get_sell_cart", getSellCart);
router.post("/sync_sell_cart", syncSellCart);

export default router;
