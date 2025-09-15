import express from 'express';
import {
  retrievePaymentIntent,
  updatePaymentIntent,
  getPaymentIntentFromSalesOrderId,
  cancelPaymentIntent,
} from '../controllers/stripeController.js';
import { requireUser, requireAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/retrieve_payment_intent', requireUser, retrievePaymentIntent);
router.get('/get_sales_order_payment_intent', requireAdmin, getPaymentIntentFromSalesOrderId);
router.post('/update_payment_intent', requireUser, updatePaymentIntent);
router.post('/cancel_payment_intent', requireAdmin, cancelPaymentIntent);

export default router;
