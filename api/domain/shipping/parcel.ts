// THE PARCEL'S OWN ROW, for the feature that owns the HANDOVER (rulings 69/70,
// migration 128).
//
// A SHIPMENT's handover choices - where it leaves from, which box, which
// service, and the courier slot the customer asked for - are columns of
// `shipping.shipments`, and fulfillments is what decides whether they are
// complete. So fulfillments needs to create the shell and write those five
// columns, and shipping is what may touch this table.
//
// A SEPARATE FILE, not domain/shipping/shipments/service.ts, for one concrete
// reason: that service imports domain/fulfillments/service.ts, so a call the
// other way would be a cycle. This module imports the repo and nothing else.
//
// It writes ONLY the customer's choices. The label, the tracking number, the
// cost, the declared value and the insurance flag are bought facts and belong
// to domain/shipping/labels.ts.
import { randomUUID } from "node:crypto";
import * as shipments from "#db/shipping/shipments/repo.ts";
import type { Executor } from "#shared/db/executor.ts";
import type {
  FulfillmentShipmentChoices, OrderViewShipment, ShipmentDirection,
} from "@dorado/contracts";

// A BARE SHELL, written the moment a customer picks a SHIPMENT rather than at
// placement. Every carrier column is null: nothing has been chosen and nothing
// has been bought.
export async function createShell(
  direction: ShipmentDirection, executor?: Executor
): Promise<string> {
  return await shipments.create({ id: randomUUID(), direction }, executor);
}

export async function getMany(
  ids: string[], executor?: Executor
): Promise<OrderViewShipment[]> {
  if (ids.length === 0) return [];
  return await shipments.getMany([...new Set(ids)], executor);
}

// THE CUSTOMER'S CHOICES, and only those - the contract is the whitelist.
export async function applyChoices(
  shipment_id: string, choices: FulfillmentShipmentChoices, executor?: Executor
): Promise<void> {
  await shipments.update(shipment_id, choices, executor);
}
