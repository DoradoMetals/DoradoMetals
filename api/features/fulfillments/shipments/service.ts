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
import * as shipmentLinks from "#features/fulfillments/shipments/repo.ts";
import * as fulfillmentService from "#features/fulfillments/service.ts";
import type { ShipmentLinkInput } from "#features/fulfillments/shipments/repo.ts";
import type { ComposedFulfillment } from "#features/fulfillments/compose.ts";
import type { PoolClient } from "pg";

type Executor = PoolClient | undefined;

export type { ShipmentLinkRow, ShipmentLinkInput } from "#features/fulfillments/shipments/repo.ts";

// Linking a parcel to a fulfillment. Called by features/shipping when a label
// is bought.
export async function link(
  input: { fulfillment_id: string } & ShipmentLinkInput, executor?: Executor
): Promise<ComposedFulfillment | null> {
  await fulfillmentService.assertCategory(input.fulfillment_id, "SHIPMENT", executor);
  await shipmentLinks.upsert(randomUUID(), input.fulfillment_id, input, executor);
  return await fulfillmentService.getById(input.fulfillment_id, executor);
}
