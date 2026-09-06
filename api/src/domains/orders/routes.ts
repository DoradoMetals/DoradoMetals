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
router.get('/:id/documents', requireAdmin, getOrderDocuments)
// The URL is the order's; media.pdfs is the documents domain's table, so the
// handlers are its (ruling 13). The import arrives as multipart, so this one
// route takes the raw body instead of the JSON parser's.
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
// The customer's sales order, ordered from a supplier. The URL is the order's
// because that is the id the caller holds; the handler is refining's because
// those are the tables it owns (ruling 26b).
router.post('/:id/supply', requireAdmin, supplyOrder)
// The other direction: a finalized purchase order's lots wrapped into a refiner
// SELL order - the Items card's "Create Sale".
router.post('/:id/refining-sale', requireAdmin, sellToRefiner)

router.patch('/:id', requireAdmin, patchOrder)

export default router
