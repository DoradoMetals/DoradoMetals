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

const router = express.Router();

router.get("/", requireUser, getCheckout);
router.get("/items", requireUser, getCheckoutItems);
router.put("/items", requireUser, putCheckoutItems);
router.delete("/items", requireUser, deleteCheckoutItems);
router.patch("/", requireUser, patchCheckout);
router.post("/payout", requireUser, saveCheckoutPayout);

export default router;
