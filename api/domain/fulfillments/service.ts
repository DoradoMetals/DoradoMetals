// What a fulfillment means, as opposed to how it is stored.
// The thin remainder: every sub-resource (methods/, pickups/, directs/, shipments/) now has its own full stack and orchestrates for itself. What's left here genuinely SPANS those children - getForOrder/getById composes the row with its detail; getSchedule merges pickups+directs on one timeline; setMethod/cancelSchedule handle category moves and booking removal; assertCategory/choose*/setStatus are the lifecycle and the invariant children check themselves against.
// The guards live here because every one is a question about a table this feature's own repo doesn't own - orders.orders, fulfillments.methods, fulfillments.shipments. A repo answering any of them would be reading a second table.
// There is no exchange side and never will be: fulfillments are a capability exchange never recorded, so these are the shapes a contract is worth the most on - nothing compares them against a second implementation.
import { randomUUID } from "node:crypto";
import * as fulfillments from "#db/fulfillments/repo.ts";
import * as methodService from "#domain/fulfillments/methods/service.ts";
import * as pickups from "#db/fulfillments/pickups/repo.ts";
import * as directs from "#db/fulfillments/directs/repo.ts";
import * as shipmentLinks from "#db/fulfillments/shipments/repo.ts";
import * as orders from "#db/orders/repo.ts";
import * as compose from "#domain/fulfillments/compose.ts";
import type { ComposedFulfillment, Details } from "#domain/fulfillments/compose.ts";
import { Conflict, NotFound } from "#shared/errors.ts";
import type { PoolClient } from "pg";
import type { fulfillments as fulfillmentTables, orders as ordersContract } from "@dorado/contracts";

type Executor = PoolClient | undefined;

export type { MethodRow } from "#domain/fulfillments/methods/service.ts";
// The composed shape is what every caller of this feature reads, so it keeps
// the name the old row type had.
type FulfillmentRow = ComposedFulfillment;

// `orders.enums.Direction` is the contract's; category is the generated row's own enum. Neither is hand-written here, so widening either is a compile error, not a runtime surprise.

// Every refusal carries a status, which is why the messages are worth writing: errorHandler shows a message to the caller only for a deliberate 4xx - these used to be bare `new Error`, so every one arrived as a generic 500 "Server error", and an admin trying to move an order off SHIPMENT was told that instead of "cancel the shipment first".
// NotFound for "that doesn't exist", Conflict for "the current state forbids this" - shared/errors.ts. A use case names the KIND of refusal; shared/middleware/errorHandler.ts maps it to a status, so no domain file spells an HTTP code (D214 item 11).

// ------------------------------------------------------------- composition

// The details of a set of fulfillments, one read per table rather than a query
// per row or four joins per query.
// Sequential, not Promise.all: these four calls share the caller's own
// transaction client (`executor`) whenever one is open, and a single pg
// client can only run one statement at a time - concurrent calls on it just
// queue today (with a deprecation warning) and raise in pg@9. Four different
// tables, so there is no one query to merge them into either.
async function detailsFor(
  rows: fulfillments.FulfillmentBaseRow[], executor?: Executor
): Promise<Details> {
  const ids = rows.map((f) => f.id);
  const methods = await methodService.byId(executor);
  const p = await pickups.getMany(ids, executor);
  const d = await directs.getMany(ids, executor);
  const s = await shipmentLinks.getMany(ids, executor);
  return {
    methods,
    pickups: compose.byFulfillment(p),
    directs: compose.byFulfillment(d),
    shipmentLinks: compose.byFulfillment(s),
  };
}

async function composeOne(
  row: fulfillments.FulfillmentBaseRow | undefined, executor?: Executor
): Promise<ComposedFulfillment | null> {
  if (!row) return null;
  return compose.compose(row, await detailsFor([row], executor));
}

// The methods section moved to domain/fulfillments/methods/service.ts: listMethods/listAllMethods/updateMethod are listAvailable/listAll/update there, and the offered-method check is assertOffered.

// ------------------------------------------------------------------- reads

// A fulfillment carries no user of its own, so "is this yours" is a question about the order. requireUser alone would let any signed-in customer read any order's pickup address and appointment time by changing a query string - present but not enough.
// Returns null for "not yours" as well as "not found", deliberately - telling the two apart would confirm the order exists.
export async function getForOrder(
  order_id: string,
  { userId, isAdmin = false }: { userId?: string; isAdmin?: boolean } = {},
  executor?: Executor
): Promise<ComposedFulfillment | null> {
  if (!isAdmin) {
    const owner = await orders.ownerOf(order_id, executor);
    if (!owner || owner !== userId) return null;
  }
  return await composeOne(await fulfillments.getByOrder(order_id, executor), executor);
}

export async function getById(
  id: string, executor?: Executor
): Promise<ComposedFulfillment | null> {
  return await composeOne(await fulfillments.getOne(id, executor), executor);
}

// Everything an employee is expected to turn up for: scheduled pickups and appointments, soonest first.
// Shipments are excluded, which falls out of the shape rather than needing a category filter: this reads only pickups/directs, and nobody is due anywhere for a parcel.
export async function getSchedule(
  filters: { from?: string; to?: string; employee_id?: string } = {},
  executor?: Executor
): Promise<ComposedFulfillment[]> {
  // Sequential for the same reason as detailsFor above: one shared client,
  // two different tables.
  const p = await pickups.getScheduled(filters, executor);
  const d = await directs.getScheduled(filters, executor);

  const ids = [...new Set([...p, ...d].map((r) => r.fulfillment_id))];
  if (ids.length === 0) return [];

  const rows = await fulfillments.getMany(ids, executor);
  return compose.composeAll(rows, await detailsFor(rows, executor))
    .sort(compose.byStartTimeThenId);
}

// ------------------------------------------------------------------ writes

// order_id references orders.orders, so creating a fulfillment for an order that doesn't exist there fails on the foreign key - checked here first, because the raw constraint error tells the caller nothing about what to do next.
// created_by_id isn't a field here (or on the paths below) - audit_stamp writes it from the connection's actor, so a fulfillment says what it's for and nothing about who made it.
async function createFulfillment(
  { order_id, method_id, status = "PENDING" }:
    { order_id: string; method_id: string; status?: string },
  executor?: Executor
): Promise<ComposedFulfillment | null> {
  if (!(await orders.exists(order_id, executor))) {
    throw new Conflict(`cannot fulfill order ${order_id}: it is not in orders.orders. ` +
        `Every order is created there directly now, so an id that misses is ` +
        `either unknown or a pre-migration order the backfill has not carried.`);
  }

  const made = await fulfillments.create(
    { id: randomUUID(), order_id, method_id, status }, executor
  );
  // No row means the order already had one - ON CONFLICT DO NOTHING - which is
  // the normal case for a second call rather than an error.
  const row = made ?? (await fulfillments.getByOrder(order_id, executor));
  return await composeOne(row, executor);
}

// A draft for checkout: the fulfillment exists and mutates while the customer decides, and order creation attaches it. The offered-method check is the same one choose() runs.
export async function createDraft(
  { method_id, direction }: { method_id: string; direction: ordersContract.enums.Direction },
  executor?: Executor
): Promise<ComposedFulfillment | null> {
  await methodService.assertOffered({ method_id, direction }, executor);
  const row = await fulfillments.createDraft(
    { id: randomUUID(), method_id }, executor
  );
  return await composeOne(row, executor);
}

// The one-way attach. Refuses rather than repoints: a draft that is already an order's fulfillment never moves.
export async function attachDraft(
  { fulfillment_id, order_id }: { fulfillment_id: string; order_id: string },
  executor?: Executor
): Promise<ComposedFulfillment> {
  const changed = await fulfillments.update(fulfillment_id, { order_id }, executor);
  if (!changed) {
    throw new Conflict(`fulfillment ${fulfillment_id} is not a draft - it already belongs to an order`);
  }
  const composed = await getById(fulfillment_id, executor);
  if (!composed) throw new Error(`fulfillment ${fulfillment_id} vanished mid-attach`);
  return composed;
}

// THE HAND-OVER A CHECKOUT ASKED FOR, given to the order it became: the draft
// the stepper mutated, else the method it named, else the direction's default -
// and the booking the chosen category needs.
// Both bookings go straight to the child repos, reading first, rather than
// through their services: assertCategory is what those add, and the category
// is right here.
export async function attachForCheckout(
  { order_id, direction, fulfillment_id, method_id, pickup_address_id, location_id, start_time }: {
    order_id: string;
    direction: ordersContract.enums.Direction;
    fulfillment_id: string | null;
    method_id: string | null;
    pickup_address_id: string | null;
    location_id: string | null;
    start_time: string | null;
  },
  executor?: Executor
): Promise<ComposedFulfillment> {
  const chosen = fulfillment_id
    ? await attachDraft({ fulfillment_id, order_id }, executor)
    : method_id
      ? await chooseById({ order_id, method_id }, executor)
      : await chooseDefault({ order_id, direction, category: "SHIPMENT" }, executor);

  // Not reachable today; a TypeError here would roll the order back with a
  // message that says nothing about an order.
  if (!chosen) {
    throw new Error(
      `order ${order_id} was created from a checkout and no fulfillment came ` +
        `back for it - this transaction must not commit`
    );
  }

  // Re-composed after a booking, never returned stale: `chosen` was put
  // together before the detail row existed, so it would say the order is going
  // to be collected by nobody.
  if (chosen.method.category === "PICKUP" && pickup_address_id) {
    if (await pickups.getFor(chosen.id, executor)) {
      await pickups.update(chosen.id, { pickup_address_id, start_time }, executor);
    } else {
      await pickups.create(
        { id: randomUUID(), fulfillment_id: chosen.id, pickup_address_id, start_time },
        executor
      );
    }
    return await recompose(chosen.id, executor);
  }
  if (chosen.method.category === "DIRECT" && location_id) {
    const is_appointment = chosen.method.type === "APPOINTMENT";
    if (await directs.getFor(chosen.id, executor)) {
      await directs.update(chosen.id, { location_id, is_appointment, start_time }, executor);
    } else {
      await directs.create(
        { id: randomUUID(), fulfillment_id: chosen.id, location_id, is_appointment, start_time },
        executor
      );
    }
    return await recompose(chosen.id, executor);
  }
  return chosen;
}

async function recompose(id: string, executor?: Executor): Promise<ComposedFulfillment> {
  const row = await getById(id, executor);
  if (!row) throw new Error(`fulfillment ${id} vanished mid-attach`);
  return row;
}

// Choosing a method, from the customer's side. Admin callers go through chooseById instead - an admin putting an order on OWN LABEL is the reason OWN LABEL exists.
export async function choose(
  { order_id, method_id, direction }:
    { order_id: string; method_id: string; direction: ordersContract.enums.Direction },
  executor?: Executor
): Promise<ComposedFulfillment | null> {
  await methodService.assertOffered({ method_id, direction }, executor);
  return await createFulfillment({ order_id, method_id }, executor);
}

// A method that has already been decided, by id. choose() is the CUSTOMER's path and checks the id against the menu; this is for a method already validated elsewhere (checkout intake, or an admin picking a hidden one) - skipping that check is the whole difference between the two functions.
export async function chooseById(
  { order_id, method_id }: { order_id: string; method_id: string },
  executor?: Executor
): Promise<ComposedFulfillment | null> {
  return await createFulfillment({ order_id, method_id }, executor);
}

// The default for a direction/category, for flows that don't ask. Both come from the seed, not a constant here, so changing the default is an UPDATE, not a deploy.
export async function chooseDefault(
  { order_id, direction, category = "SHIPMENT" }:
    { order_id: string; direction: ordersContract.enums.Direction; category?: fulfillmentTables.methods.Row["category"] },
  executor?: Executor
): Promise<ComposedFulfillment | null> {
  const method = await methodService.getDefault({ direction, category }, executor);
  return await createFulfillment({ order_id, method_id: method.id }, executor);
}

// updated_by_id isn't a third argument any more - audit_stamp takes the author off the connection, so a status move says what moved and nothing about who.
export async function setStatus(
  { id, status }: { id: string; status: string },
  executor?: Executor
): Promise<ComposedFulfillment | null> {
  const changed = await fulfillments.update(id, { status }, executor);
  if (!changed) return null;
  return await getById(id, executor);
}

// Changing how an order will be handed over. The detail row goes with it - compose.ts attaches all three slots, so leaving the old one behind would make the response carry both a pickup and a shipment with no way to tell which is true.
// The shipment link is deliberately NOT deleted: it points at a real shipping.shipments row with a paid-for label, and moving off SHIPMENT with a parcel still attached is refused instead - cancelling a shipment is a different decision that costs money and belongs to domain/shipping.
export async function setMethod(
  { id, method_id }: { id: string; method_id: string },
  executor?: Executor
): Promise<ComposedFulfillment | null> {
  const target = await methodService.getOne(method_id, executor);
  if (!target) throw new NotFound(`no such fulfillment method: ${method_id}`);

  const current = await fulfillments.getOne(id, executor);
  if (!current) throw new NotFound(`no such fulfillment: ${id}`);

  const currentMethod = await methodService.getOne(current.method_id, executor);
  if (
    currentMethod?.category === "SHIPMENT" &&
    target.category !== "SHIPMENT" &&
    (await shipmentLinks.existsFor(id, executor))
  ) {
    throw new Conflict(`fulfillment ${id} already has a shipment - cancel it through features/shipping ` +
        `before moving the order off SHIPMENT`);
  }

  const changed = await fulfillments.update(id, { method_id }, executor);
  if (!changed) {
    throw new Error(`fulfillment ${id} vanished between its existence check and the method update - ` +
        `this transaction must not commit`);
  }

  if (target.category !== "PICKUP") await pickups.remove(id, executor);
  if (target.category !== "DIRECT") await directs.remove(id, executor);

  return await getById(id, executor);
}

// Category is checked against the method, not trusted. A pickup row for a DROPSHIP fulfillment is a row every read attaches and none expects, and nothing in the schema would catch it.
export async function assertCategory(
  fulfillment_id: string, category: fulfillmentTables.methods.Row["category"], executor?: Executor
): Promise<void> {
  const row = await fulfillments.getOne(fulfillment_id, executor);
  if (!row) throw new NotFound(`no such fulfillment: ${fulfillment_id}`);
  const method = await methodService.getOne(row.method_id, executor);
  const found = method?.category;
  if (!found) throw new NotFound(`no such fulfillment: ${fulfillment_id}`);
  if (found !== category) {
    throw new Conflict(`fulfillment ${fulfillment_id} is a ${found}, not a ${category} - ` +
        `change the method before scheduling`);
  }
}

// schedulePickup/scheduleDirect/linkShipment moved to the resources that own their tables - pickups/service.ts, directs/service.ts, shipments/service.ts. Each is one table's write plus assertCategory; callers (orders/create.ts, shipping/shipments/service.ts) reach those directly.

// Cancelling a booking removes the appointment, not the fulfillment - the order is still going to be fulfilled somehow, just nobody is due anywhere yet.
// This one genuinely spans children: a fulfillment carries at most one booking and the caller doesn't say which kind, so cancelling clears BOTH tables - pushing it into either child would leave the other's row behind.
export async function cancelSchedule(
  fulfillment_id: string, executor?: Executor
): Promise<ComposedFulfillment | null> {
  await pickups.remove(fulfillment_id, executor);
  await directs.remove(fulfillment_id, executor);
  return await getById(fulfillment_id, executor);
}
