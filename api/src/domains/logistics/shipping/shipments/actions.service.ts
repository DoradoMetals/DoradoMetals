import * as shipmentsService from '#logistics/shipping/shipments/service.ts'
import * as orderTransactions from '#orders/transactions/service.ts'
import { guardChargedSale, recordActionReason, updateTracking } from '#orders/service.ts'
import withTransaction from '#shared/db/withTransaction.ts'
import * as rules from '#logistics/shipping/rules.ts'

export async function chargeForOrder(
  shipmentId: string,
  shipping_charge: number,
  override_reason: string | null = null,
  session_id: string | null = null
): Promise<{ success: true }> {
  const shipment = await shipmentsService.getById(shipmentId)
  rules.assertShipment(shipment, shipmentId)
  const link = await shipmentsService.getOrderLink(shipmentId)
  const orderId = link?.order_id ?? null
  rules.assertChargeableOrder(orderId, shipmentId)
  const overridden = await guardChargedSale(
    orderId,
    override_reason,
    session_id,
    'changing the shipping charge'
  )
  await withTransaction(async (tx) => {
    await shipmentsService.setChargeForOrder(orderId, shipping_charge, tx)
    await recordActionReason(orderId, 'shipping_charge', overridden, tx)
  })
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
