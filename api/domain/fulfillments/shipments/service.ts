// THE LINK between a fulfillment and a parcel: fulfillments.shipments.
// No routes.ts/controller.ts, deliberately: this resource has exactly one consumer, another service (domain/shipping/shipments calls link() when a label is bought) - no HTTP surface needed.
// The parcel itself belongs to domain/shipping; what lives here is that THIS fulfillment is being handed over as THAT shipment.
import { randomUUID } from "node:crypto";
import * as shipmentLinks from "#db/fulfillments/shipments/repo.ts";
import * as fulfillmentService from "#domain/fulfillments/service.ts";
import type { ShipmentLinkInput } from "#db/fulfillments/shipments/repo.ts";
import type { ComposedFulfillment } from "#domain/fulfillments/compose.ts";
import type { PoolClient } from "pg";

type Executor = PoolClient | undefined;

export type { ShipmentLinkRow, ShipmentLinkInput } from "#db/fulfillments/shipments/repo.ts";

// Linking a parcel to a fulfillment. Called by domain/shipping when a label is bought.
// READ FIRST, by shipment_id - the table's unique key, since a fulfillment may hold several parcels but a parcel belongs to exactly one fulfillment.
export async function link(
  input: { fulfillment_id: string } & ShipmentLinkInput, executor?: Executor
): Promise<ComposedFulfillment | null> {
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
