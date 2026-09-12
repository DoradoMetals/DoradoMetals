import { strictBody, uuidParam } from '#shared/http/validate.ts'
import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import * as shipmentPatch from '#logistics/shipping/shipments/patch.service.ts'
import * as shipmentActions from '#logistics/shipping/shipments/actions.service.ts'
import * as labels from '#logistics/shipping/labels.ts'
import * as shipmentView from '#logistics/shipping/shipments/view.ts'
import {
  ShipmentActualCostBody,
  ShipmentChargeBody,
  ShipmentPatch,
  ShipmentTrackingBody,
} from '@dorado/contracts'
import type { Request } from 'express'

const isAdmin = (req: Request): boolean => req.user?.role === 'admin'

export const patchShipment = asyncHandler(async (req, res) => {
  const id = uuidParam(req, 'id')
  const body = strictBody(ShipmentPatch, req.body)
  await shipmentPatch.patchShipment(id, body)
  return res.status(200).json(await shipmentView.getById(id, isAdmin(req)))
})

export const chargeShipment = asyncHandler(async (req, res) => {
  const id = uuidParam(req, 'id')
  const body = strictBody(ShipmentChargeBody, req.body)
  await shipmentActions.chargeForOrder(id, body.shipping_charge)
  return res.status(200).json(await shipmentView.getById(id, isAdmin(req)))
})

export const recordShipmentActualCost = asyncHandler(async (req, res) => {
  const id = uuidParam(req, 'id')
  const body = strictBody(ShipmentActualCostBody, req.body)
  await shipmentActions.recordActualCost(id, body.shipping_actual)
  return res.status(200).json(await shipmentView.getById(id, isAdmin(req)))
})

export const recordShipmentTracking = asyncHandler(async (req, res) => {
  const id = uuidParam(req, 'id')
  const body = strictBody(ShipmentTrackingBody, req.body)
  await shipmentActions.recordTracking(id, body.tracking_number)
  return res.status(200).json(await shipmentView.getById(id, isAdmin(req)))
})

export const getShipment = asyncHandler(async (req, res) => {
  const id = uuidParam(req, 'id')
  const view = await shipmentView.getById(id, isAdmin(req))
  if (!view) {
    return res.status(404).json({ error: 'Not Found', message: `no shipment ${id}` })
  }
  return res.json(view)
})

export const getShipmentsByOrder = asyncHandler(async (req, res) => {
  return res.json(await shipmentView.forOrder(uuidParam(req, 'orderId'), isAdmin(req)))
})

export const buyShipmentLabel = asyncHandler(async (req, res) => {
  const id = uuidParam(req, 'id')
  await labels.buyLabel(id)
  return res.status(200).json(await shipmentView.getById(id, isAdmin(req)))
})
