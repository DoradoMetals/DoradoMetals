import * as shipmentsService from '#logistics/shipping/shipments/service.ts'
import withTransaction from '#shared/db/withTransaction.ts'
import * as rules from '#logistics/shipping/rules.ts'
import type { ShipmentPatch } from '@dorado/contracts'

export async function patchShipment(
  shipmentId: string,
  body: ShipmentPatch
): Promise<{ success: true }> {
  rules.assertPatchNamesAField(body)

  const shipment = await shipmentsService.getById(shipmentId)
  rules.assertShipment(shipment, shipmentId)

  if (body.carrier_service_id !== undefined) {
    rules.assertAwaitingTracking(shipment, shipmentId)
    const carrier_service_id = body.carrier_service_id
    await withTransaction((tx) => shipmentsService.update(shipmentId, { carrier_service_id }, tx))
  }

  return { success: true }
}
