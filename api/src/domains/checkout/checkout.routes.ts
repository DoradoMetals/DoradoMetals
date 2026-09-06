import express from 'express'

import {
  getCheckout,
  patchCheckout,
  saveCheckoutPayout,
  getCheckoutLots,
  putCheckoutLots,
  deleteCheckoutLots,
} from '#checkout/controller.ts'
import { requireUser } from '#shared/middleware/authMiddleware.ts'

const router = express.Router()

router.get('/', requireUser, getCheckout)
router.get('/lots', requireUser, getCheckoutLots)
router.put('/lots', requireUser, putCheckoutLots)
router.delete('/lots', requireUser, deleteCheckoutLots)
router.patch('/', requireUser, patchCheckout)
router.post('/payout', requireUser, saveCheckoutPayout)

export default router
