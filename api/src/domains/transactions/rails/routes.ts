import express from 'express'
import { getPaymentView } from '#transactions/rails/controller.ts'
import { requireAdmin } from '#shared/middleware/authMiddleware.ts'

const router = express.Router()

router.get('/:orderId', requireAdmin, getPaymentView)

export default router
