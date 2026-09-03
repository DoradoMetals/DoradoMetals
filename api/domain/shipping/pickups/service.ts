// Carrier pickups: shipping.pickups, hangs off a SHIPMENT. No order/carrier reconstruction here - reach them through shipping/shipments, like this file does.
// WHEN A WRITE CAN'T RESOLVE A SHIPMENT, THE ROW IS SKIPPED - the caller is still told what was asked, deliberately.
// This has already thrown once after a real FedEx label was generated: the rollback discarded the order while FedEx kept the label.
import { randomUUID } from "node:crypto";
import * as pickups from "#db/shipping/pickups/repo.ts";
import * as shipmentService from "#domain/shipping/shipments/service.ts";
import type { PickupBaseRow } from "#db/shipping/pickups/repo.ts";
import type { Executor } from "#shared/db/executor.ts";

// What a caller supplies: an order and a carrier NAME, date/time apart - the shipment lookup below resolves it to what this table actually keys on.
export type PickupInput = {
  id?: string;
  user_id?: string | null;
  order_id?: string | null;
  carrier?: string | null;
  pickup_requested_at?: Date | string | null;
  date?: string | null;
  time?: string | null;
  pickup_status?: string | null;
  confirmation_number?: string | number | null;
  location?: string | null;
};

// ------------------------------------------------------------------- reads

export async function getAll(executor?: Executor): Promise<PickupBaseRow[]> {
  return await pickups.getAll(executor);
}

export async function getById(
  id: string, executor?: Executor
): Promise<PickupBaseRow | null> {
  return (await pickups.getOne(id, executor)) ?? null;
}

// Returns a LIST: an order can be collected more than once (a first attempt, then a rebooking) - the caller filters. Resolved through the order's shipment, not a column.
export async function getByOrder(
  order_id: string, executor?: Executor
): Promise<PickupBaseRow[]> {
  const shipment = await shipmentService.getByOrder(order_id, executor);
  if (!shipment) return [];
  return await pickups.getByShipments([shipment.id], executor);
}

// Same read, batched - grouping one statement's rows by shipment reproduces what a per-order query would give. An order with no shipment gets [].
export async function getByOrders(
  order_ids: string[], executor?: Executor
): Promise<Map<string, PickupBaseRow[]>> {
  const out = new Map<string, PickupBaseRow[]>();
  if (order_ids.length === 0) return out;

  const shipmentOf = await shipmentService.getByOrders(order_ids, executor);
  for (const order_id of order_ids) out.set(order_id, []);
  if (shipmentOf.size === 0) return out;

  const shipments = [...new Map([...shipmentOf.values()].map((s) => [s.id, s])).values()];
  const rows = await pickups.getByShipments(shipments.map((s) => s.id), executor);
  if (rows.length === 0) return out;

  const byShipment = new Map<string, PickupBaseRow[]>();
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

// The shipment an order's pickup hangs off, or null when there is not one yet.
async function shipmentFor(
  order_id: string | null | undefined, executor?: Executor
): Promise<string | null> {
  if (!order_id) return null;
  return (await shipmentService.getByOrder(order_id, executor))?.id ?? null;
}

// What the row would have looked like, had a shipment been there to hang it off - used only when the write above was skipped.
function pickupView(
  id: string,
  input: Pick<PickupInput, "pickup_status" | "confirmation_number" | "location">,
  requested_at: Date | string | null
): PickupBaseRow {
  // NOT A REAL ROW: shipping.pickups.shipment_id is NOT NULL, so nothing was written - this fabricates what the row WOULD have held, for a caller that already booked a real courier.
  // Cast rather than typed honestly - there is no honest PickupBaseRow for a row that doesn't exist.
  return {
    id,
    shipment_id: null,
    requested_at,
    status: input.pickup_status ?? "scheduled",
    confirmation_number:
      input.confirmation_number === null || input.confirmation_number === undefined
        ? null
        : String(input.confirmation_number),
    location: input.location ?? null,
  } as unknown as PickupBaseRow;
}

// A HELPER (ruling 56): joins the caller's own transaction, never its own -
// order placement is the reason (see the file header), even though today
// only tests call this directly.
export async function create(
  input: PickupInput, tx: Executor
): Promise<PickupBaseRow | null> {
  const id = input.id ?? randomUUID();

  // Date and time combine via Postgres's text cast, not a JS Date.
  const requested_at =
    input.pickup_requested_at ??
    (input.date ? `${input.date} ${input.time || "00:00:00"}` : null);

  const shipment_id = await shipmentFor(input.order_id, tx);
  if (shipment_id) {
    return await pickups.create({
      id, shipment_id,
      requested_at,
      status: input.pickup_status ?? "scheduled",
      confirmation_number:
        input.confirmation_number === null || input.confirmation_number === undefined
          ? null
          : String(input.confirmation_number),
      location: input.location ?? null,
    }, tx);
  }

  // WHEN THE ROW WAS SKIPPED (no shipment yet), THE PICKUP IS STILL REAL.
  return pickupView(id, input, requested_at);
}

// Booking when the shipment is already known - unlike create() above, which must resolve an order to one first.
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
): Promise<PickupBaseRow> {
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

// A HELPER: cancelPickup (shipping/operations/service.ts) is the one
// production caller, and it opens its own transaction around this call
// deliberately - see that file for why the write must not share a
// transaction with the FedEx call before it.
export async function update(
  input: PickupInput, tx: Executor
): Promise<PickupBaseRow | null> {
  const id = input.id;
  if (!id) return null;

  const requested_at =
    input.pickup_requested_at ??
    (input.date ? `${input.date} ${input.time || "00:00:00"}` : null);

  const existing = await pickups.getOne(id, tx);
  if (existing) {
    await pickups.update(id, {
      requested_at: requested_at ?? existing.requested_at,
      status: input.pickup_status ?? existing.status,
      confirmation_number:
        input.confirmation_number === null || input.confirmation_number === undefined
          ? existing.confirmation_number
          : String(input.confirmation_number),
      location: input.location ?? existing.location,
    }, tx);
  }

  return (await getById(id, tx)) ?? pickupView(id, input, requested_at);
}

// A HELPER: no production caller today; required tx for the same reason as
// create/update above rather than inventing a use case nothing calls.
export async function remove(id: string, tx: Executor): Promise<boolean> {
  await pickups.remove(id, tx);
  return true;
}
