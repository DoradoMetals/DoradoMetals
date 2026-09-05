import * as shipments from "#db/shipping/shipments/repo.ts";
import * as rules from "#logistics/shipping/rules.ts";
import { withDecisions } from "#shared/views.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { ShipmentView } from "@dorado/contracts";

export async function getById(
  id: string, isAdmin: boolean, executor?: Executor
): Promise<ShipmentView | null> {
  return (await read(id, null, isAdmin, executor))[0] ?? null;
}

export async function forOrder(
  order_id: string, isAdmin: boolean, executor?: Executor
): Promise<ShipmentView[]> {
  return await read(null, order_id, isAdmin, executor);
}

async function read(
  id: string | null, order_id: string | null, isAdmin: boolean, executor?: Executor
): Promise<ShipmentView[]> {
  const rows = await shipments.view(id, order_id, executor);
  return rows.map((row) => withDecisions(row, rules.shipmentDecisions(row, isAdmin)));
}
