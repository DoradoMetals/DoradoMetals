import express from "express";
import {
  retrievePaymentIntent,
  updatePaymentIntent,
  getPaymentIntentFromSalesOrderId,
  cancelPaymentIntent,
} from "#features/stripe/controller.js";

import { requireUser, requireAdmin } from "#shared/middleware/authMiddleware.js";

const router = express.Router();

router.get("/retrieve_payment_intent", requireUser, retrievePaymentIntent);
router.get("/get_sales_order_payment_intent", requireAdmin, getPaymentIntentFromSalesOrderId);
router.post("/update_payment_intent", requireUser, updatePaymentIntent);
router.post("/cancel_payment_intent", requireAdmin, cancelPaymentIntent);

export default router;
