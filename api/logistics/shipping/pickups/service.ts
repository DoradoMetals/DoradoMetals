import * as pickups from "#db/shipping/pickups/repo.ts";
import * as shipmentService from "#logistics/shipping/shipments/service.ts";
import type { ShipmentPickup, ShipmentPickupWrite } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

export async function getAll(executor?: Executor): Promise<ShipmentPickup[]> {
  return await pickups.getAll(executor);
}

export async function getById(
  id: string, executor?: Executor
): Promise<ShipmentPickup | null> {
  return (await pickups.getOne(id, executor)) ?? null;
}

export async function getByOrder(
  order_id: string, executor?: Executor
): Promise<ShipmentPickup[]> {
  const shipment = await shipmentService.getByOrder(order_id, executor);
  if (!shipment) return [];
  return await pickups.getByShipments([shipment.id], executor);
}

export async function getByOrders(
  order_ids: string[], executor?: Executor
): Promise<Map<string, ShipmentPickup[]>> {
  const out = new Map<string, ShipmentPickup[]>();
  if (order_ids.length === 0) return out;

  const shipmentOf = await shipmentService.getByOrders(order_ids, executor);
  for (const order_id of order_ids) out.set(order_id, []);
  if (shipmentOf.size === 0) return out;

  const shipments = [...new Map([...shipmentOf.values()].map((s) => [s.id, s])).values()];
  const rows = await pickups.getByShipments(shipments.map((s) => s.id), executor);
  if (rows.length === 0) return out;

  const byShipment = new Map<string, ShipmentPickup[]>();
  for (const row of rows) {
    if (row.shipment_id === null) continue;
    if (!byShipment.has(row.shipment_id)) byShipment.set(row.shipment_id, []);
    byShipment.get(row.shipment_id)!.push(row);
  }

  for (const [order_id, shipment] of shipmentOf) {
    out.set(order_id, byShipment.get(shipment.id) ?? []);
  }
  return out;
}

export async function recordForShipment(
  shipment_id: string, date: string, time: string,
  confirmation_number: string | number | null, location: string | null,
  executor?: Executor
): Promise<ShipmentPickup> {
  return await pickups.create(
    {
      shipment_id,
      requested_at: `${date} ${time || "00:00:00"}`,
      status: "scheduled",
      confirmation_number:
        confirmation_number == null ? null : String(confirmation_number),
      location,
    },
    executor
  );
}

export async function update(
  id: string, patch: ShipmentPickupWrite, tx: Executor
): Promise<ShipmentPickup | null> {
  await pickups.update(id, patch, tx);
  return await getById(id, tx);
}
