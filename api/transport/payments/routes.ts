import express from "express";
import {
  retrievePaymentIntent,
  updatePaymentIntent,
  getPaymentIntentFromSalesOrderId,
  cancelPaymentIntent,
} from "#transport/payments/controller.ts";

import { requireUser, requireAdmin } from "#shared/middleware/authMiddleware.ts";

const router = express.Router();

// NO WIRE ADAPTER. Payments converted 2026-08-27 - the LAST *_WIRE adapter:
// the frontend reads the nested intent from @dorado/contracts (status,
// attempt with the provider's reference, details for the instrument), in
// DOLLARS - the flatten that put exchange's names and cents back is gone.
// Only get_sales_order_payment_intent ever carried it; the other three routes
// answer with Stripe's client_secret or Stripe's own object. `routing` left
// the wire when the exchange read stopped being SELECT *, and it stays gone:
// never SELECT, log, or return bank details.

router.get("/retrieve_payment_intent", requireUser, retrievePaymentIntent);
router.get("/get_sales_order_payment_intent", requireAdmin, getPaymentIntentFromSalesOrderId);
router.post("/update_payment_intent", requireUser, updatePaymentIntent);
router.post("/cancel_payment_intent", requireAdmin, cancelPaymentIntent);

export default router;
