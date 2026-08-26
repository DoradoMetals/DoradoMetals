import express from "express";
import {
  retrievePaymentIntent,
  updatePaymentIntent,
  getPaymentIntentFromSalesOrderId,
  cancelPaymentIntent,
} from "#features/payments/controller.ts";

import { requireUser, requireAdmin } from "#shared/middleware/authMiddleware.js";

import * as paymentsWire from "#features/payments/wire.ts";
import { wireShape } from "#shared/wire/middleware.ts";

const router = express.Router();

// The wire adapter, mounted once for the whole feature rather than called by
// hand in every handler. `body: false` because no write here carries a payment
// intent: update_payment_intent posts a cart to be priced and cancel posts a
// Stripe id, neither of which is this entity. Controllers return the internal
// shape and know nothing about the frontend not having caught up. Deleting the
// adapter is deleting this line.
router.use(wireShape(paymentsWire, { body: false }));

router.get("/retrieve_payment_intent", requireUser, retrievePaymentIntent);
router.get("/get_sales_order_payment_intent", requireAdmin, getPaymentIntentFromSalesOrderId);
router.post("/update_payment_intent", requireUser, updatePaymentIntent);
router.post("/cancel_payment_intent", requireAdmin, cancelPaymentIntent);

export default router;
