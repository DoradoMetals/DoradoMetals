import express from 'express'

import {
  addFundsToOrder,
  adminCreateOrder,
  cancelOrder,
  createOrder,
  createOrderReview,
  finalizeOrder,
  getOrder,
  getOrderDocuments,
  listOrders,
  patchOrder,
  reopenOrder,
} from '#orders/controller.ts'

import lotRoutes from '#orders/lots/routes.ts'
import spotRoutes from '#orders/spots/routes.ts'
import addressRoutes from '#orders/addresses/routes.ts'

import { sellToRefiner, supplyOrder } from '#refining/controller.ts'
import { importOrderDocument, sendOrderDocument } from '#documents/pdfs/controller.ts'
import { getFulfillmentByOrder } from '#logistics/fulfillments/controller.ts'
import { getPickupsByOrder } from '#logistics/fulfillments/pickups/controller.ts'
import { getDirectsByOrder } from '#logistics/fulfillments/directs/controller.ts'
import { getDropoffsByOrder } from '#logistics/fulfillments/dropoffs/controller.ts'
import { getShipmentsByOrder } from '#logistics/shipping/shipments/controller.ts'
import { getOrderPaymentDetails } from '#transactions/details/controller.ts'

import { requireUser, requireAdmin } from '#shared/middleware/authMiddleware.ts'
import { requireOwnOrderParam } from '#shared/middleware/ownership.ts'

const router = express.Router()

router.get('/', requireUser, listOrders)
router.post('/', requireUser, createOrder)
router.post('/admin', requireAdmin, adminCreateOrder)

router.use('/', lotRoutes)
router.use('/', spotRoutes)
router.use('/', addressRoutes)

router.get('/:id', requireUser, requireOwnOrderParam, getOrder)
router.get('/:id/documents', requireUser, requireOwnOrderParam, getOrderDocuments)
router.post('/:id/documents/:kind/send', requireAdmin, sendOrderDocument)
router.post(
  '/:id/documents/:kind',
  requireAdmin,
  express.raw({ type: 'multipart/form-data', limit: '25mb' }),
  importOrderDocument
)

router.get('/:orderId/fulfillments', requireUser, requireOwnOrderParam, getFulfillmentByOrder)
router.get('/:orderId/shipments', requireUser, requireOwnOrderParam, getShipmentsByOrder)
router.get('/:orderId/pickups', requireAdmin, getPickupsByOrder)
router.get('/:orderId/directs', requireAdmin, getDirectsByOrder)
router.get('/:orderId/dropoffs', requireAdmin, getDropoffsByOrder)
router.get('/:orderId/payment-details', requireUser, requireOwnOrderParam, getOrderPaymentDetails)

router.post('/:id/review', requireUser, requireOwnOrderParam, createOrderReview)

router.post('/:id/add_funds', requireAdmin, addFundsToOrder)
router.post('/:id/finalize', requireAdmin, finalizeOrder)
router.post('/:id/cancel', requireAdmin, cancelOrder)
router.post('/:id/reopen', requireAdmin, reopenOrder)
router.post('/:id/supply', requireAdmin, supplyOrder)
router.post('/:id/refining-sale', requireAdmin, sellToRefiner)

router.patch('/:id', requireAdmin, patchOrder)

export default router
