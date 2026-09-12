import express from 'express'

import {
  createOrderLot,
  deleteOrderLot,
  getOrderLots,
  patchOrderLot,
} from '#orders/lots/controller.ts'
import { splitOrderLot } from '#inventory/controller.ts'

import { requireUser, requireAdmin } from '#shared/middleware/authMiddleware.ts'
import { requireOwnOrderParam } from '#shared/middleware/ownership.ts'

const router = express.Router()

router.patch('/lots/:id', requireAdmin, patchOrderLot)
router.delete('/lots/:id', requireAdmin, deleteOrderLot)
router.post('/lots/:id/split', requireAdmin, splitOrderLot)

router.get('/:id/lots', requireUser, requireOwnOrderParam, getOrderLots)
router.post('/:id/lots', requireAdmin, createOrderLot)

export default router
