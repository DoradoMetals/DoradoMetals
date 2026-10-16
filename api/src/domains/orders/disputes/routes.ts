import express from 'express'

import { getOrderDisputes, openLotDispute, resolveDispute } from '#orders/disputes/controller.ts'

import { requireAdmin } from '#shared/middleware/authMiddleware.ts'

const router = express.Router()

router.get('/:id/disputes', requireAdmin, getOrderDisputes)
router.post('/lots/:id/disputes', requireAdmin, openLotDispute)
router.patch('/disputes/:id', requireAdmin, resolveDispute)

export default router
