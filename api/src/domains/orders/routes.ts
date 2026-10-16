import express from 'express'

import {
  addFundsToOrder,
  adminCreateOrder,
  adoptAssay,
  cancelOrder,
  createOrder,
  finalizeOrder,
  getAdoptAssayProposal,
  getOrder,
  getOrderActivity,
  getOrderDocuments,
  listOrderSorts,
  listOrders,
  patchOrder,
  putPayoutMethods,
} from '#orders/controller.ts'

import lotRoutes from '#orders/lots/routes.ts'
import spotRoutes from '#orders/spots/routes.ts'
import addressRoutes from '#orders/addresses/routes.ts'
import disputeRoutes from '#orders/disputes/routes.ts'
import {
  createForOrder as createOrderNote,
  getForOrder as getOrderNotes,
} from '#crm/notes/controller.ts'

import { sellToRefiner, supplyOrder } from '#refining/controller.ts'
import {
  downloadOrderDocument,
  importOrderDocument,
  sendOrderDocument,
} from '#documents/pdfs/controller.ts'
import { getFulfillmentByOrder } from '#logistics/fulfillments/controller.ts'
import { getPickupsByOrder } from '#logistics/fulfillments/pickups/controller.ts'
import { getDirectsByOrder } from '#logistics/fulfillments/directs/controller.ts'
import { getDropoffsByOrder } from '#logistics/fulfillments/dropoffs/controller.ts'
import { getShipmentsByOrder } from '#logistics/shipping/shipments/controller.ts'
import { getOrderClaims } from '#logistics/shipping/claims/controller.ts'
import { getOrderPaymentDetails } from '#transactions/details/controller.ts'
import {
  issueOrderRefund,
  listOrderRefunds,
  refundOrder,
} from '#transactions/refunds/controller.ts'

import { requireUser, requireAdmin } from '#shared/middleware/authMiddleware.ts'
import { requireOwnOrderParam } from '#shared/middleware/ownership.ts'

const router = express.Router()

router.get('/', requireUser, listOrders)
router.get('/sorts', requireAdmin, listOrderSorts)
router.post('/', requireUser, createOrder)
router.post('/admin', requireAdmin, adminCreateOrder)

router.use('/', lotRoutes)
router.use('/', spotRoutes)
router.use('/', addressRoutes)
router.use('/', disputeRoutes)

router.get('/:id', requireUser, requireOwnOrderParam, getOrder)
router.get('/:id/activity', requireAdmin, getOrderActivity)
router.get('/:id/notes', requireAdmin, getOrderNotes)
router.post('/:id/notes', requireAdmin, createOrderNote)
router.put('/:id/payout_methods', requireAdmin, putPayoutMethods)
router.get('/:id/documents', requireUser, requireOwnOrderParam, getOrderDocuments)
router.get('/:id/documents/:kind', requireUser, requireOwnOrderParam, downloadOrderDocument)
router.post('/:id/documents/:kind/send', requireAdmin, sendOrderDocument)
router.post(
  '/:id/documents/:kind',
  requireAdmin,
  express.raw({ type: 'multipart/form-data', limit: '25mb' }),
  importOrderDocument
)

router.get('/:orderId/fulfillments', requireUser, requireOwnOrderParam, getFulfillmentByOrder)
router.get('/:orderId/shipments', requireUser, requireOwnOrderParam, getShipmentsByOrder)
router.get('/:id/claims', requireAdmin, getOrderClaims)
router.get('/:orderId/pickups', requireAdmin, getPickupsByOrder)
router.get('/:orderId/directs', requireAdmin, getDirectsByOrder)
router.get('/:orderId/dropoffs', requireAdmin, getDropoffsByOrder)
router.get('/:orderId/payment-details', requireUser, requireOwnOrderParam, getOrderPaymentDetails)

router.post('/:id/add_funds', requireAdmin, addFundsToOrder)
router.post('/:id/finalize', requireAdmin, finalizeOrder)
router.post('/:id/cancel', requireAdmin, cancelOrder)
router.get('/:id/refunds', requireAdmin, listOrderRefunds)
router.post('/:id/refunds', requireAdmin, refundOrder)
router.post('/:id/refunds/:refund_id/issue', requireAdmin, issueOrderRefund)
router.post('/:id/supply', requireAdmin, supplyOrder)
router.post('/:id/refining-sale', requireAdmin, sellToRefiner)
router.get('/:id/adopt_assay', requireAdmin, getAdoptAssayProposal)
router.post('/:id/adopt_assay', requireAdmin, adoptAssay)

router.patch('/:id', requireAdmin, patchOrder)

export default router
