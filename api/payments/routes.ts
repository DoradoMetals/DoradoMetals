import express from 'express'
import {
  retrievePaymentIntent,
  updatePaymentIntent,
  getPaymentIntentFromSalesOrderId,
  cancelPaymentIntent,
} from '#payments/controller.ts'

import { requireUser, requireAdmin } from '#shared/middleware/authMiddleware.ts'

const router = express.Router()

router.get('/retrieve_payment_intent', requireUser, retrievePaymentIntent)
router.get('/get_sales_order_payment_intent', requireAdmin, getPaymentIntentFromSalesOrderId)
router.post('/update_payment_intent', requireUser, updatePaymentIntent)
router.post('/cancel_payment_intent', requireAdmin, cancelPaymentIntent)

export default router
