import express from "express";

import { sendPricedEmail } from "#features/media/emails/controller.ts";

import { requireUser } from "#shared/middleware/authMiddleware.ts";

const router = express.Router();

// POST /purchase_order_created IS GONE (D91, wave 3). The confirmation is
// sent by the SERVER at order creation, after the commit, rendered from its
// own read - features/media/emails/service.ts's sendOrderPlacedConfirmation.
// The route existed only so the browser could trigger it with its own copy of
// the order, which is the ids-in-data-out violation ruling 10 forbids and the
// reliability hole D91 names. sendCreatedEmail is still exported and still
// tested; it simply has one caller now, and that caller is the API.
// The offer-accepted path died with the offers (Jacob, 28 August). Same
// send, new name: the invoice mail that goes out once an order's pricing is
// finalized. Nothing in the frontend called the old path - the hook left with
// 086 - so the rename breaks no caller.
router.post("/purchase_order_priced", requireUser, sendPricedEmail);

export default router;
