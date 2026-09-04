import { randomUUID } from "node:crypto";
import * as shipmentLinks from "#db/fulfillments/shipments/repo.ts";
import * as fulfillmentService from "#domain/fulfillments/service.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { FulfillmentShipment, FulfillmentShipmentPatch, FulfillmentView } from "@dorado/contracts";

export async function link(
  input:
    { fulfillment_id: string } & Pick<FulfillmentShipment, "shipment_id"> & FulfillmentShipmentPatch,
  executor?: Executor
): Promise<FulfillmentView | null> {
  await fulfillmentService.assertCategory(input.fulfillment_id, "SHIPMENT", executor);
  const [existing] = await shipmentLinks.getByShipment([input.shipment_id], executor);
  if (existing) {
    await shipmentLinks.update(
      input.shipment_id,
      {
        fulfillment_id: input.fulfillment_id,
        recipient_location_id: input.recipient_location_id,
        shipper_location_id: input.shipper_location_id,
      },
      executor
    );
  } else {
    await shipmentLinks.create(
      {
        id: randomUUID(), fulfillment_id: input.fulfillment_id,
        shipment_id: input.shipment_id,
        recipient_location_id: input.recipient_location_id,
        shipper_location_id: input.shipper_location_id,
      },
      executor
    );
  }
  return await fulfillmentService.getById(input.fulfillment_id, executor);
}
