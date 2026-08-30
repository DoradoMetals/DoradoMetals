// Carrier pickups: one row in each schema, and a shipment that only one of the
// two schemas knows about.
//
// THE HARD PART IS THAT exchange RECORDS AN ORDER AND THIS SCHEMA RECORDS A
// SHIPMENT. shipping.pickups.shipment_id is NOT NULL, so a write has to resolve
// the order to its shipment before it can happen at all.
//
// WHEN IT CANNOT RESOLVE, THE NEW-SCHEMA ROW IS SKIPPED AND exchange IS STILL
// WRITTEN. That is deliberate and it is the most important line in this file.
// The mirror it replaces did exactly the same, for a reason with history:
// purchase-orders/service.ts books a pickup inside the transaction that writes
// the shipping label, and this path has already thrown once after a FedEx label
// was generated - the rollback discarded the order while FedEx kept the label.
// Failing a live purchase order because a migration could not find a shipment
// is not a trade worth making. The pickup is real; where it hangs in the new
// schema can be reconciled later.
import { randomUUID } from "node:crypto";
import withTransaction from "#shared/db/withTransaction.js";
import * as pickups from "#features/shipping/pickups/repo.ts";
import * as legacy from "#legacy/shipping/pickups/repo.ts";
import * as shipmentService from "#features/shipping/shipments/service.ts";
import * as carriers from "#features/shipping/carriers/service.ts";
import * as orders from "#features/orders/repo.ts";
import * as compose from "#features/shipping/pickups/compose.ts";
import type { ComposedPickup, Lookups, ShipmentContext } from "#features/shipping/pickups/compose.ts";
import type { PickupBaseRow } from "#features/shipping/pickups/repo.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { LegacyPickup } from "#legacy/shipping/pickups/repo.ts";

// What a caller supplies. exchange's shape, because that is what every call
// site has always sent - an order and a carrier NAME, with the date and time
// apart.
export type PickupInput = LegacyPickup & { id?: string };

// --------------------------------------------------------------- composition

// What each shipment can tell its pickups. One pass, genuinely batched.
//
// IT SAID "batched" AND LOOPED (D101). The loop asked the shipments service for
// one shipment and the orders repo for one owner, per pickup, and every one of
// those is a round trip. Both reads have a batched form now, so the whole map
// costs a fixed number regardless of how many pickups are being composed.
async function contextFor(
  rows: PickupBaseRow[], executor?: Executor
): Promise<Lookups> {
  const ids = [...new Set(rows.map((p) => p.shipment_id).filter((id): id is string => !!id))];
  if (ids.length === 0) return { byShipment: new Map() };

  // The shipments service already reconstructs the order link and resolves the
  // carrier, so this asks it rather than walking fulfillments again.
  const [carrierRows, shipments] = await Promise.all([
    carriers.getAllCarriers(),
    shipmentService.getManyById(ids, executor),
  ]);
  return {
    byShipment: await contextFromShipments(carrierRows, shipments, executor),
  };
}

// The context map itself, given the shipments already composed. Split out so
// that a caller which HAS those shipments - getByOrders below, which resolved
// them to find the pickups at all - does not read them a second time.
async function contextFromShipments(
  carrierRows: Awaited<ReturnType<typeof carriers.getAllCarriers>>,
  shipments: Awaited<ReturnType<typeof shipmentService.getManyById>>,
  executor?: Executor
): Promise<Map<string, ShipmentContext>> {
  const byShipment = new Map<string, ShipmentContext>();
  const carrierNames = new Map(carrierRows.map((c) => [c.id, c.organization.name]));

  const orderOf = new Map(
    shipments.map((s) => [s.id, s.purchase_order_id ?? s.sales_order_id ?? null])
  );
  const owners = await orders.ownersById(
    [...new Set([...orderOf.values()].filter((id): id is string => !!id))],
    executor
  );

  for (const shipment of shipments) {
    const order_id = orderOf.get(shipment.id) ?? null;
    byShipment.set(shipment.id, {
      order_id,
      user_id: order_id ? (owners.get(order_id) ?? null) : null,
      carrier: shipment.carrier_id ? (carrierNames.get(shipment.carrier_id) ?? null) : null,
    });
  }
  return byShipment;
}

// ------------------------------------------------------------------- reads

export async function getAll(executor?: Executor): Promise<ComposedPickup[]> {
  const rows = await pickups.getAll(executor);
  return compose.composeAll(rows, await contextFor(rows, executor));
}

export async function getById(
  id: string, executor?: Executor
): Promise<ComposedPickup | null> {
  const row = await pickups.getOne(id, executor);
  if (!row) return null;
  return compose.compose(row, await contextFor([row], executor));
}

// RETURNS A LIST, matching the implementation it replaces - an order can be
// collected more than once, a first attempt and a rebooking, and the caller
// filters.
//
// Answered by going through the order's shipment rather than by a column,
// because the column is what this migration removed.
export async function getByOrder(
  order_id: string, executor?: Executor
): Promise<ComposedPickup[]> {
  const shipment = await shipmentService.getByOrder(order_id, executor);
  if (!shipment) return [];
  const rows = await pickups.getByShipments([shipment.id], executor);
  return compose.composeAll(rows, await contextFor(rows, executor));
}

// THE SAME READ FOR A LIST OF ORDERS. D101: the composed order read called
// getByOrder inside a per-order loop, and getByOrder is itself nine round
// trips before it reads a single pickup.
//
// EQUIVALENT TO CALLING getByOrder PER ORDER. Each order resolves to the same
// shipment `shipmentService.getByOrders` gives it - which is `getByOrder`
// batched, hop for hop - and get_by_shipments.sql orders by
// `requested_at DESC, id ASC`, so grouping one statement's rows by shipment
// yields each order's pickups in the order a per-order query gave them. An
// order with no shipment gets `[]`, exactly as before.
export async function getByOrders(
  order_ids: string[], executor?: Executor
): Promise<Map<string, ComposedPickup[]>> {
  const out = new Map<string, ComposedPickup[]>();
  if (order_ids.length === 0) return out;

  const shipmentOf = await shipmentService.getByOrders(order_ids, executor);
  for (const order_id of order_ids) out.set(order_id, []);
  if (shipmentOf.size === 0) return out;

  const shipments = [...new Map([...shipmentOf.values()].map((s) => [s.id, s])).values()];
  const rows = await pickups.getByShipments(shipments.map((s) => s.id), executor);
  if (rows.length === 0) return out;

  const lookups: Lookups = {
    byShipment: await contextFromShipments(
      await carriers.getAllCarriers(), shipments, executor
    ),
  };

  const byShipment = new Map<string, ComposedPickup[]>();
  for (const row of rows) {
    if (row.shipment_id === null) continue;
    if (!byShipment.has(row.shipment_id)) byShipment.set(row.shipment_id, []);
    byShipment.get(row.shipment_id)!.push(compose.compose(row, lookups));
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

export async function create(
  input: PickupInput, executor?: Executor
): Promise<ComposedPickup | null> {
  const run = async (c: Executor): Promise<ComposedPickup | null> => {
    const id = input.id ?? randomUUID();

    // exchange first and unconditionally - see the header. It is the record of
    // truth and the one the caller's transaction is really about. It hands back
    // the timestamp it computed, which is how a date and a time cross into the
    // new schema without JavaScript doing the arithmetic.
    const written = await legacy.create(id, input, c);

    const shipment_id = await shipmentFor(input.order_id, c);
    if (shipment_id) {
      await pickups.create(id, shipment_id, {
        requested_at: written?.pickup_requested_at ?? null,
        // Lowercase to match exchange.carrier_pickups' CHECK allowlist, which
        // 101 copies onto shipping.pickups.status. The capital S here and in
        // legacy/shipping/pickups/repo.ts was a value BOTH tables refuse.
        status: input.pickup_status ?? "scheduled",
        confirmation_number:
          input.confirmation_number === null || input.confirmation_number === undefined
            ? null
            : String(input.confirmation_number),
        location: input.location ?? null,
      }, c);
    }

    // WHEN THE NEW-SCHEMA ROW WAS SKIPPED, THE PICKUP IS STILL REAL. Reading it
    // back would find nothing and answer null - to a caller that has just
    // booked a courier with FedEx. Composed from what was written instead.
    return (
      (await getById(id, c)) ??
      compose.composeFromWrite(
        id,
        { ...input, pickup_status: input.pickup_status ?? "scheduled" },
        written?.pickup_requested_at ?? null
      )
    );
  };
  return executor ? await run(executor) : await withTransaction(run);
}

export async function update(
  input: PickupInput, executor?: Executor
): Promise<ComposedPickup | null> {
  const id = input.id;
  if (!id) return null;

  const run = async (c: Executor): Promise<ComposedPickup | null> => {
    const written = await legacy.update(id, input, c);

    const existing = await pickups.getOne(id, c);
    if (existing) {
      await pickups.update(id, {
        requested_at: written?.pickup_requested_at ?? existing.requested_at,
        status: input.pickup_status ?? existing.status,
        confirmation_number:
          input.confirmation_number === null || input.confirmation_number === undefined
            ? existing.confirmation_number
            : String(input.confirmation_number),
        location: input.location ?? existing.location,
      }, c);
    }

    return (
      (await getById(id, c)) ??
      compose.composeFromWrite(id, input, written?.pickup_requested_at ?? null)
    );
  };
  return executor ? await run(executor) : await withTransaction(run);
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const run = async (c: Executor): Promise<boolean> => {
    await legacy.remove(id, c);
    await pickups.remove(id, c);
    return true;
  };
  return executor ? await run(executor) : await withTransaction(run);
}
