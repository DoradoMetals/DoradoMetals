import * as shipmentLinks from '#db/fulfillments/shipments/repo.ts'
import * as fulfillmentService from '#logistics/fulfillments/service.ts'
import type { Executor } from '#shared/db/executor.ts'
import type { FulfillmentShipmentPatch, FulfillmentView } from '@dorado/contracts'

export async function link(
  fulfillment_id: string,
  shipment_id: string,
  places: FulfillmentShipmentPatch,
  executor?: Executor
): Promise<FulfillmentView | null> {
  await fulfillmentService.assertCategory(fulfillment_id, 'SHIPMENT', executor)
  await shipmentLinks.upsert(fulfillment_id, shipment_id, places, executor)
  return await fulfillmentService.getById(fulfillment_id, executor)
}
