import express from 'express'

import {
  createOrderLot,
  deleteOrderLot,
  getOrderLots,
  patchOrderLot,
  searchLots,
  splitOrderLot,
} from '#orders/lots/controller.ts'

import { requireUser, requireAdmin } from '#shared/middleware/authMiddleware.ts'
import { requireOwnOrderParam } from '#shared/middleware/ownership.ts'

const router = express.Router()

// Mounted at /api/lots, not under an order: a lot search is a search of the
// LOT table, and the caller holds no order id when it makes one (GAP 10).
export const lotSearchRoutes = express.Router()
lotSearchRoutes.get('/', requireAdmin, searchLots)

router.patch('/lots/:id', requireAdmin, patchOrderLot)
router.delete('/lots/:id', requireAdmin, deleteOrderLot)
router.post('/lots/:id/split', requireAdmin, splitOrderLot)

router.get('/:id/lots', requireUser, requireOwnOrderParam, getOrderLots)
router.post('/:id/lots', requireAdmin, createOrderLot)

export default router
