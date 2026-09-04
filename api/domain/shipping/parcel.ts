import { randomUUID } from "node:crypto";
import * as shipments from "#db/shipping/shipments/repo.ts";
import type { Executor } from "#shared/db/executor.ts";
import type {
  FulfillmentShipmentChoices, OrderViewShipment, ShipmentDirection,
} from "@dorado/contracts";

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

export async function applyChoices(
  shipment_id: string, choices: FulfillmentShipmentChoices, executor?: Executor
): Promise<void> {
  await shipments.update(shipment_id, choices, executor);
}
