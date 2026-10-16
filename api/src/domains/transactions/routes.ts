import express from 'express'
import {
  retrievePaymentIntent,
  updatePaymentIntent,
  cancelPaymentIntent,
} from '#transactions/controller.ts'

import { requireUser, requireAdmin } from '#shared/middleware/authMiddleware.ts'

const router = express.Router()

router.get('/retrieve_payment_intent', requireUser, retrievePaymentIntent)
router.post('/update_payment_intent', requireUser, updatePaymentIntent)
router.post('/cancel_payment_intent', requireAdmin, cancelPaymentIntent)

export default router
