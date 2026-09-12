import * as shipmentsService from '#logistics/shipping/shipments/service.ts'
import * as orderTransactions from '#orders/transactions/service.ts'
import { updateTracking } from '#orders/service.ts'
import withTransaction from '#shared/db/withTransaction.ts'
import * as rules from '#logistics/shipping/rules.ts'

export async function chargeForOrder(
  shipmentId: string,
  shipping_charge: number
): Promise<{ success: true }> {
  const shipment = await shipmentsService.getById(shipmentId)
  rules.assertShipment(shipment, shipmentId)
  const link = await shipmentsService.getOrderLink(shipmentId)
  const orderId = link?.order_id ?? null
  rules.assertChargeableOrder(orderId, shipmentId)
  await withTransaction((tx) => shipmentsService.setChargeForOrder(orderId, shipping_charge, tx))
  return { success: true }
}

export async function recordActualCost(
  shipmentId: string,
  shipping_actual: number
): Promise<{ success: true }> {
  const shipment = await shipmentsService.getById(shipmentId)
  rules.assertShipment(shipment, shipmentId)
  const link = await shipmentsService.getOrderLink(shipmentId)
  const purchaseOrderId = link?.direction === 'purchase' ? link.order_id : null
  rules.assertPurchaseOrder(purchaseOrderId, shipmentId)
  await orderTransactions.update(purchaseOrderId, { shipping_fee_actual: shipping_actual })
  return { success: true }
}

export async function recordTracking(
  shipmentId: string,
  tracking_number: string
): Promise<{ success: true }> {
  const shipment = await shipmentsService.getById(shipmentId)
  rules.assertShipment(shipment, shipmentId)
  const link = await shipmentsService.getOrderLink(shipmentId)
  const salesOrderId = link?.direction === 'sale' ? link.order_id : null
  rules.assertSalesOrder(salesOrderId, shipmentId)
  return await updateTracking(salesOrderId, tracking_number)
}
