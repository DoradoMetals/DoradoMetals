import express from "express";

import {
  sendCreatedEmail,
  sendPricedEmail,
} from "#features/media/emails/controller.ts";

import { requireUser } from "#shared/middleware/authMiddleware.ts";

const router = express.Router();

router.post("/purchase_order_created", requireUser, sendCreatedEmail);
// The offer-accepted path died with the offers (Jacob, 28 August). Same
// send, new name: the invoice mail that goes out once an order's pricing is
// finalized. Nothing in the frontend called the old path - the hook left with
// 086 - so the rename breaks no caller.
router.post("/purchase_order_priced", requireUser, sendPricedEmail);

export default router;
