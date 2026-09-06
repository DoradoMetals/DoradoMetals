import express from 'express'

import {
  assignRefiningLots,
  createPoolLock,
  createRefiningOrder,
  deleteRefiningLot,
  getPoolBalances,
  getPoolEntries,
  getRefiningLots,
  getRefiningOrder,
  listRefiningOrders,
  patchRefiningLot,
  patchRefiningOrder,
  sendRefiningOrder,
  settleRefiningOrder,
} from '#refining/controller.ts'

import { requireAdmin } from '#shared/middleware/authMiddleware.ts'

const router = express.Router()

router.get('/pool', requireAdmin, getPoolBalances)
router.get('/pool/entries', requireAdmin, getPoolEntries)
router.post('/pool/locks', requireAdmin, createPoolLock)

router.patch('/lots/:id', requireAdmin, patchRefiningLot)
router.delete('/lots/:id', requireAdmin, deleteRefiningLot)

router.get('/orders', requireAdmin, listRefiningOrders)
router.post('/orders', requireAdmin, createRefiningOrder)
router.get('/orders/:id', requireAdmin, getRefiningOrder)
router.patch('/orders/:id', requireAdmin, patchRefiningOrder)
router.post('/orders/:id/send', requireAdmin, sendRefiningOrder)
router.post('/orders/:id/settle', requireAdmin, settleRefiningOrder)
router.get('/orders/:id/lots', requireAdmin, getRefiningLots)
router.post('/orders/:id/lots', requireAdmin, assignRefiningLots)

export default router
