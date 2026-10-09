import express from 'express'
import {
  catalogQuote,
  checkoutQuote,
  orderQuote,
  profitBreakdown,
  refiningOrderQuote,
} from '#pricing/controller.ts'
import { requireUser, requireAdmin } from '#shared/middleware/authMiddleware.ts'
import { requireOwnOrder } from '#shared/middleware/ownership.ts'

const router = express.Router()

router.post('/catalog', catalogQuote)
router.get('/checkout', requireUser, checkoutQuote)
router.post('/order', requireUser, requireOwnOrder, orderQuote)
router.post('/refining_order', requireAdmin, refiningOrderQuote)
router.post('/profit_breakdown', requireAdmin, profitBreakdown)

export default router
