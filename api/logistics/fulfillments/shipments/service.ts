import * as shipmentLinks from "#db/fulfillments/shipments/repo.ts";
import * as fulfillmentService from "#logistics/fulfillments/service.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { FulfillmentShipmentPatch, FulfillmentView } from "@dorado/contracts";

export async function link(
  fulfillment_id: string,
  shipment_id: string,
  places: FulfillmentShipmentPatch,
  executor?: Executor
): Promise<FulfillmentView | null> {
  await fulfillmentService.assertCategory(fulfillment_id, "SHIPMENT", executor);
  const [existing] = await shipmentLinks.getByShipment([shipment_id], executor);
  const columns = {
    recipient_location_id: places.recipient_location_id,
    shipper_location_id: places.shipper_location_id,
  };
  if (existing) {
    await shipmentLinks.update(shipment_id, { fulfillment_id, ...columns }, executor);
  } else {
    await shipmentLinks.create(
      { fulfillment_id, shipment_id, ...columns }, executor
    );
  }
  return await fulfillmentService.getById(fulfillment_id, executor);
}
