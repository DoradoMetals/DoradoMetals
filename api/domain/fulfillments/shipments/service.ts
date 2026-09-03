// THE LINK between a fulfillment and a parcel: fulfillments.shipments.
//
// NO routes.ts AND NO controller.ts, and that is deliberate rather than
// unfinished. Ruling 26c gives every resource its own stack so that a consumer
// can depend on one resource without depending on its parent; this resource has
// exactly one consumer and it is another SERVICE - features/shipping/shipments
// calls linkShipment when a label is bought. It has no HTTP surface of its own,
// so it declares no paths. The day it needs one, the two files go here beside
// this one and the parent mounts them.
//
// The parcel itself belongs to features/shipping. What lives here is the fact
// that THIS fulfillment is being handed over as THAT shipment.
import { randomUUID } from "node:crypto";
import * as shipmentLinks from "#db/fulfillments/shipments/repo.ts";
import * as fulfillmentService from "#domain/fulfillments/service.ts";
import type { ShipmentLinkInput } from "#db/fulfillments/shipments/repo.ts";
import type { ComposedFulfillment } from "#domain/fulfillments/compose.ts";
import type { PoolClient } from "pg";

type Executor = PoolClient | undefined;

export type { ShipmentLinkRow, ShipmentLinkInput } from "#db/fulfillments/shipments/repo.ts";

// Linking a parcel to a fulfillment. Called by features/shipping when a label
// is bought.
export async function link(
  input: { fulfillment_id: string } & ShipmentLinkInput, executor?: Executor
): Promise<ComposedFulfillment | null> {
  await fulfillmentService.assertCategory(input.fulfillment_id, "SHIPMENT", executor);
  await shipmentLinks.upsert(
    {
      id: randomUUID(),
      fulfillment_id: input.fulfillment_id,
      shipment_id: input.shipment_id,
      recipient_location_id: input.recipient_location_id,
      shipper_location_id: input.shipper_location_id,
    },
    executor
  );
  return await fulfillmentService.getById(input.fulfillment_id, executor);
}
