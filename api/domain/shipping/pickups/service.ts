// Carrier pickups: shipping.pickups, hangs off a SHIPMENT. No order/carrier
// reconstruction here - reach them through shipping/shipments, like this file
// does.
//
// THE ORDER-SHAPED WRITE PATH IS GONE. `create()` took an order id, a carrier
// NAME and a date and a time apart, resolved the order to a shipment, and -
// when it could not - FABRICATED a row that had not been written and returned
// it as though it had, because a real courier had already been booked. Nothing
// but its own tests ever called it: the live booking path is
// recordForShipment(), which is handed the shipment it hangs off. The
// fabrication went with it, along with `PickupInput`, whose `carrier` and
// `user_id` fields lint:input-shapes had already reported as read by nothing.
import { randomUUID } from "node:crypto";
import * as pickups from "#db/shipping/pickups/repo.ts";
import * as shipmentService from "#domain/shipping/shipments/service.ts";
import type { ShipmentPickup, ShipmentPickupWrite } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

// ------------------------------------------------------------------- reads

export async function getAll(executor?: Executor): Promise<ShipmentPickup[]> {
  return await pickups.getAll(executor);
}

export async function getById(
  id: string, executor?: Executor
): Promise<ShipmentPickup | null> {
  return (await pickups.getOne(id, executor)) ?? null;
}

// Returns a LIST: an order can be collected more than once (a first attempt, then a rebooking) - the caller filters. Resolved through the order's shipment, not a column.
export async function getByOrder(
  order_id: string, executor?: Executor
): Promise<ShipmentPickup[]> {
  const shipment = await shipmentService.getByOrder(order_id, executor);
  if (!shipment) return [];
  return await pickups.getByShipments([shipment.id], executor);
}

// Same read, batched - grouping one statement's rows by shipment reproduces what a per-order query would give. An order with no shipment gets [].
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

// ------------------------------------------------------------------ writes

// Booking, when the shipment is already known - which it always is on the live
// path: a courier is booked as part of buying the label for the parcel it will
// collect.
export async function recordForShipment(
  {
    shipment_id, date, time, confirmation_number = null, location = null,
  }: {
    shipment_id: string;
    date: string;
    time: string;
    confirmation_number?: string | number | null;
    location?: string | null;
  },
  executor?: Executor
): Promise<ShipmentPickup> {
  return await pickups.create(
    {
      id: randomUUID(),
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

// A HELPER (ruling 56): cancelPickup (shipping/operations/service.ts) is the
// one caller, and it opens its own transaction around this call deliberately -
// see that file for why the write must not share a transaction with the FedEx
// call before it.
// The repo's UPDATE is a full replace, so the caller passes every column.
export async function update(
  id: string, patch: ShipmentPickupWrite, tx: Executor
): Promise<ShipmentPickup | null> {
  await pickups.update(id, patch, tx);
  return await getById(id, tx);
}
