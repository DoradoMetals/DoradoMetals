// Carrier pickups: shipping.pickups, which hangs off a SHIPMENT.
//
// THE READ IS THE ROW (ruling 12, D214). compose.ts is deleted - it rebuilt
// exchange.carrier_pickups' flat shape (order_id and user_id reconstructed
// through the shipment, carrier resolved to a name), and nothing needs that
// shape any more. A caller that wants the order or the carrier now reaches
// them the same way this file does: through shipping/shipments.
//
// WHEN A WRITE CANNOT RESOLVE A SHIPMENT, THE ROW IS SKIPPED AND THE CALLER IS
// STILL TOLD WHAT WAS ASKED. That is deliberate and it is the most important
// line in this file. purchase-orders/service.ts books a pickup inside the
// transaction that writes the shipping label, and this path has already
// thrown once after a FedEx label was generated - the rollback discarded the
// order while FedEx kept the label. Failing a live purchase order because a
// migration could not find a shipment is not a trade worth making.
import { randomUUID } from "node:crypto";
import withTransaction from "#shared/db/withTransaction.ts";
import * as pickups from "#db/shipping/pickups/repo.ts";
import * as shipmentService from "#domain/shipping/shipments/service.ts";
import type { PickupBaseRow } from "#db/shipping/pickups/repo.ts";
import type { Executor } from "#shared/db/executor.ts";

// What a caller supplies. exchange's shape, because that is what every call
// site has always sent - an order and a carrier NAME, with the date and time
// apart. A WRITE-side concern, unchanged by this wave: the shipment lookup
// below is what resolves an order to the row this table actually keys on.
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

// RETURNS A LIST, matching the implementation it replaces - an order can be
// collected more than once, a first attempt and a rebooking, and the caller
// filters.
//
// Answered by going through the order's shipment rather than by a column,
// because the column is what this migration removed.
export async function getByOrder(
  order_id: string, executor?: Executor
): Promise<PickupBaseRow[]> {
  const shipment = await shipmentService.getByOrder(order_id, executor);
  if (!shipment) return [];
  return await pickups.getByShipments([shipment.id], executor);
}

// THE SAME READ FOR A LIST OF ORDERS. D101: batched hop for hop with
// shipmentService.getByOrders, so grouping one statement's rows by shipment
// yields each order's pickups in the order a per-order query gave them. An
// order with no shipment gets `[]`, exactly as before.
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

// What the row would have looked like had a shipment been there to hang it
// off - used only when the write above was skipped, so a caller that just
// booked a real courier is not told nothing happened.
function pickupView(
  id: string,
  input: Pick<PickupInput, "pickup_status" | "confirmation_number" | "location">,
  requested_at: Date | string | null
): PickupBaseRow {
  // NOT A REAL ROW. shipping.pickups.shipment_id is NOT NULL, so nothing was
  // actually written when this is called - this says what a row WOULD have
  // held, for the caller that just booked a real courier and needs an answer
  // regardless (see create()'s and update()'s own comments). Cast rather than
  // typed honestly because there is no honest PickupBaseRow for a row that
  // does not exist; `requested_at` is genuinely `Date | string | null` here
  // too, the same widening the shipment write types document.
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

export async function create(
  input: PickupInput, executor?: Executor
): Promise<PickupBaseRow | null> {
  const run = async (c: Executor): Promise<PickupBaseRow | null> => {
    const id = input.id ?? randomUUID();

    // Native-only since the purge (D212). The date and time combine in
    // Postgres via the text cast - the no-JavaScript-date rule the legacy
    // statement used to enforce, kept without it.
    const requested_at =
      input.pickup_requested_at ??
      (input.date ? `${input.date} ${input.time || "00:00:00"}` : null);

    const shipment_id = await shipmentFor(input.order_id, c);
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
      }, c);
    }

    // WHEN THE ROW WAS SKIPPED (no shipment yet), THE PICKUP IS STILL REAL.
    return pickupView(id, input, requested_at);
  };
  return executor ? await run(executor) : await withTransaction(run);
}

// THE ROW FLOW'S BOOKING (D210): native-only - a new-flow order writes no
// exchange rows, so the exchange-first create above is not for it. The date
// and time are combined IN POSTGRES via the text cast, the same
// no-JavaScript-date rule the legacy statement documents.
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

export async function update(
  input: PickupInput, executor?: Executor
): Promise<PickupBaseRow | null> {
  const id = input.id;
  if (!id) return null;

  const run = async (c: Executor): Promise<PickupBaseRow | null> => {
    const requested_at =
      input.pickup_requested_at ??
      (input.date ? `${input.date} ${input.time || "00:00:00"}` : null);

    const existing = await pickups.getOne(id, c);
    if (existing) {
      await pickups.update(id, {
        requested_at: requested_at ?? existing.requested_at,
        status: input.pickup_status ?? existing.status,
        confirmation_number:
          input.confirmation_number === null || input.confirmation_number === undefined
            ? existing.confirmation_number
            : String(input.confirmation_number),
        location: input.location ?? existing.location,
      }, c);
    }

    return (await getById(id, c)) ?? pickupView(id, input, requested_at);
  };
  return executor ? await run(executor) : await withTransaction(run);
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const run = async (c: Executor): Promise<boolean> => {
    await pickups.remove(id, c);
    return true;
  };
  return executor ? await run(executor) : await withTransaction(run);
}
