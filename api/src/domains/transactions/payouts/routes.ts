import express from 'express'
import {
  getPayout,
  listPayTo,
  openPayout,
  patchPayout,
  sendPayout,
} from '#transactions/payouts/controller.ts'
import { requireAdmin } from '#shared/middleware/authMiddleware.ts'

const router = express.Router()

router.post('/', requireAdmin, openPayout)
router.get('/pay_to', requireAdmin, listPayTo)
router.get('/:id', requireAdmin, getPayout)
router.post('/:id/send', requireAdmin, sendPayout)
router.patch('/:id', requireAdmin, patchPayout)

export default router
