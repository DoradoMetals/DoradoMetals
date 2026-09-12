import express from 'express'

import { sendPickupCompleteEmail, sendPricedEmail } from '#documents/emails/controller.ts'

import { requireAdmin, requireUser } from '#shared/middleware/authMiddleware.ts'

const router = express.Router()

router.post('/purchase_order_priced', requireUser, sendPricedEmail)
router.post('/pickup_complete', requireAdmin, sendPickupCompleteEmail)

export default router
