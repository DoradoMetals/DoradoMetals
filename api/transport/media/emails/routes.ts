import express from "express";

import { sendPricedEmail } from "#transport/media/emails/controller.ts";

import { requireUser } from "#shared/middleware/authMiddleware.ts";

const router = express.Router();

// POST /purchase_order_created is gone - the confirmation is sent server-side at order creation (sendOrderPlacedConfirmation). sendCreatedEmail is still exported and tested; its only caller now is the API itself.
// purchase_order_priced is the invoice mail sent once an order's pricing is finalized.
router.post("/purchase_order_priced", requireUser, sendPricedEmail);

export default router;
