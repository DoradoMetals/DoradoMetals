import express from 'express'
import {
  failPayout,
  getPayout,
  listPayTo,
  markPayoutSent,
  openPayout,
  sendPayout,
} from '#transactions/payouts/controller.ts'
import { requireAdmin } from '#shared/middleware/authMiddleware.ts'

const router = express.Router()

router.post('/', requireAdmin, openPayout)
router.get('/pay_to', requireAdmin, listPayTo)
router.get('/:id', requireAdmin, getPayout)
router.post('/:id/send', requireAdmin, sendPayout)
router.post('/:id/mark_sent', requireAdmin, markPayoutSent)
router.post('/:id/fail', requireAdmin, failPayout)

export default router
