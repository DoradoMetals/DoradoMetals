import express from 'express'

import {
  assignRefiningLots,
  cancelRefiningOrder,
  createPoolLock,
  createRefiningOrder,
  deleteRefiningLot,
  getPoolBalances,
  getPoolEntries,
  getRefiningDocuments,
  getRefiningLots,
  getRefiningOrder,
  getRefiningSpots,
  listRefiningOrders,
  patchRefiningLot,
  patchRefiningOrder,
  sendRefiningOrder,
  settleRefiningOrder,
} from '#refining/controller.ts'

import { getRefiningPayment } from '#transactions/rails/controller.ts'
import { getFulfillmentByRefiningOrder } from '#logistics/fulfillments/controller.ts'
import { importRefiningDocument } from '#documents/pdfs/controller.ts'
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
router.post('/orders/:id/cancel', requireAdmin, cancelRefiningOrder)
router.get('/orders/:id/spots', requireAdmin, getRefiningSpots)
// The URL is the refiner order's, because that is the id the caller holds; the
// handlers live with the domains that own payments.transfers and media.pdfs
// (ruling 13).
router.get('/orders/:id/payment', requireAdmin, getRefiningPayment)
router.get('/orders/:id/fulfillment', requireAdmin, getFulfillmentByRefiningOrder)
router.get('/orders/:id/documents', requireAdmin, getRefiningDocuments)
router.post(
  '/orders/:id/documents/:kind',
  requireAdmin,
  express.raw({ type: 'multipart/form-data', limit: '25mb' }),
  importRefiningDocument
)
router.post('/orders/:id/settle', requireAdmin, settleRefiningOrder)
router.get('/orders/:id/lots', requireAdmin, getRefiningLots)
router.post('/orders/:id/lots', requireAdmin, assignRefiningLots)

export default router
