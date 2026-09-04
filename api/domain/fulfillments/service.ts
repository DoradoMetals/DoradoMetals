// What a fulfillment means, as opposed to how it is stored.
//
// The thin remainder: every sub-resource (methods/, pickups/, directs/,
// shipments/) has its own stack and orchestrates for itself. What is left here
// genuinely SPANS those children - view/getForOrder/getById compose the row
// with its method, its children and the decisions that follow; getSchedule
// merges pickups+directs on one timeline; setMethod/cancelSchedule handle
// category moves and booking removal; assertCategory/choose*/setStatus are the
// lifecycle and the invariant children check themselves against.
//
// The guards live here because every one is a question about a table this
// feature's own repo does not own - orders.orders, fulfillments.methods,
// fulfillments.shipments.
//
// Every refusal lives in rules.ts (ruling 65) and is called as one line here,
// so this file reads as the happy path and nothing else. The KIND is the
// answer: NotFound for "that does not exist", Conflict for "the current state
// forbids this"; errorHandler maps it.
import { randomUUID } from "node:crypto";
import * as fulfillments from "#db/fulfillments/repo.ts";
import * as methodService from "#domain/fulfillments/methods/service.ts";
import * as pickups from "#db/fulfillments/pickups/repo.ts";
import * as directs from "#db/fulfillments/directs/repo.ts";
import * as shipmentLinks from "#db/fulfillments/shipments/repo.ts";
import * as orders from "#db/orders/repo.ts";
import * as compose from "#domain/fulfillments/compose.ts";
import * as rules from "#domain/fulfillments/rules.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { Checkout,
  Direction, Fulfillment, FulfillmentCategory, FulfillmentDirect, FulfillmentMethodRead,
  FulfillmentPickup, FulfillmentShipment, FulfillmentView,
} from "@dorado/contracts";

// ------------------------------------------------------------- composition

// The details of a set of fulfillments, one read per table rather than a query
// per row or four joins per query.
// Sequential, not Promise.all: these four calls share the caller's own
// transaction client (`executor`) whenever one is open, and a single pg client
// can only run one statement at a time - concurrent calls on it just queue
// today (with a deprecation warning) and raise in pg@9.
// The return shape is inline, not named: it is a bag of four different
// entities' Maps, not a derivation of any one of them - compose.ts's compose()
// and composeAll() take the identical shape (duplicated rather than shared,
// same call as the Window type in fulfillments/directs and pickups repos).
async function detailsFor(
  rows: Fulfillment[], executor?: Executor
): Promise<{
  methods: Map<string, FulfillmentMethodRead>;
  pickups: Map<string, FulfillmentPickup>;
  directs: Map<string, FulfillmentDirect>;
  shipmentLinks: Map<string, FulfillmentShipment[]>;
}> {
  const ids = rows.map((f) => f.id);
  const methods = await methodService.byId(executor);
  const p = await pickups.getMany(ids, executor);
  const d = await directs.getMany(ids, executor);
  const s = await shipmentLinks.getMany(ids, executor);
  return {
    methods,
    pickups: compose.byFulfillment(p),
    directs: compose.byFulfillment(d),
    shipmentLinks: compose.groupByFulfillment(s),
  };
}

async function composeOne(
  row: Fulfillment | undefined, executor?: Executor
): Promise<FulfillmentView | null> {
  if (!row) return null;
  return compose.compose(row, await detailsFor([row], executor));
}

// ------------------------------------------------------------------- reads

// A fulfillment carries no user of its own, so "is this yours" is a question
// about the order. requireUser alone would let any signed-in customer read any
// order's pickup address and appointment time by changing a query string.
// Returns null for "not yours" as well as "not found", deliberately - telling
// the two apart would confirm the order exists.
export async function getForOrder(
  order_id: string,
  { userId, isAdmin = false }: { userId?: string; isAdmin?: boolean } = {},
  executor?: Executor
): Promise<FulfillmentView | null> {
  if (!isAdmin) {
    const owner = await orders.ownerOf(order_id, executor);
    if (!owner || owner !== userId) return null;
  }
  return await composeOne(await fulfillments.getByOrder(order_id, executor), executor);
}

export async function getById(
  id: string, executor?: Executor
): Promise<FulfillmentView | null> {
  return await composeOne(await fulfillments.getOne(id, executor), executor);
}

// Everything an employee is expected to turn up for: scheduled pickups and
// appointments, soonest first. Shipments are excluded, which falls out of the
// shape rather than needing a category filter - this reads only pickups and
// directs, and nobody is due anywhere for a parcel.
export async function getSchedule(
  filters: { from?: string; to?: string; employee_id?: string } = {},
  executor?: Executor
): Promise<FulfillmentView[]> {
  // Sequential for the same reason as detailsFor above: one shared client, two
  // different tables.
  const p = await pickups.getScheduled(filters, executor);
  const d = await directs.getScheduled(filters, executor);

  const ids = [...new Set([...p, ...d].map((r) => r.fulfillment_id))];
  if (ids.length === 0) return [];

  const rows = await fulfillments.getMany(ids, executor);
  return compose.composeAll(rows, await detailsFor(rows, executor))
    .sort(rules.byStartTimeThenId);
}

// ------------------------------------------------------------------ writes

// order_id references orders.orders, so creating a fulfillment for an order
// that does not exist there fails on the foreign key - checked here first,
// because the raw constraint error tells the caller nothing about what to do
// next.
// created_by_id is not a field here (or on the paths below) - audit_stamp
// writes it from the connection's actor.
async function createFulfillment(
  { order_id, method_id, status = "PENDING" }:
    { order_id: string; method_id: string; status?: string },
  executor?: Executor
): Promise<FulfillmentView> {
  rules.assertFulfillable(await orders.exists(order_id, executor), order_id);

  const made = await fulfillments.create(
    { id: randomUUID(), order_id, method_id, status }, executor
  );
  // No row means the order already had one - ON CONFLICT DO NOTHING - which is
  // the normal case for a second call rather than an error.
  const row = made ?? (await fulfillments.getByOrder(order_id, executor));
  const view = await composeOne(row, executor);
  rules.assertComposed(view, order_id);
  return view;
}

// A draft for checkout: the fulfillment exists and mutates while the customer
// decides, and order creation attaches it. The offered-method check is the
// same one choose() runs.
export async function createDraft(
  { method_id, direction }: { method_id: string; direction: Direction },
  executor?: Executor
): Promise<FulfillmentView> {
  await methodService.assertOffered({ method_id, direction }, executor);
  const row = await fulfillments.createDraft(
    { id: randomUUID(), method_id }, executor
  );
  const view = await composeOne(row, executor);
  rules.assertComposed(view, row.id);
  return view;
}

// The one-way attach. Refuses rather than repoints: a draft that is already an
// order's fulfillment never moves.
export async function attachDraft(
  { fulfillment_id, order_id }: { fulfillment_id: string; order_id: string },
  executor?: Executor
): Promise<FulfillmentView> {
  const changed = await fulfillments.update(fulfillment_id, { order_id }, executor);
  rules.assertDraft(changed, fulfillment_id);
  return await recompose(fulfillment_id, executor);
}

// THE HAND-OVER A CHECKOUT ASKED FOR, given to the order it became: the draft
// the stepper mutated, else the method it named, else the direction's default -
// and the booking the chosen category needs.
// Both bookings go straight to the child repos, reading first, rather than
// through their services: assertCategory is what those add, and the category
// is right here.
export async function attachForCheckout(
  order_id: string, checkout: Checkout, executor?: Executor
): Promise<FulfillmentView> {
  const {
    fulfillment_id, fulfillment_method_id: method_id,
    pickup_address_id, appointment_location_id: location_id, appointment_time: start_time,
  } = checkout;
  const direction: Direction = checkout.direction === "sale" ? "sale" : "purchase";
  const chosen = fulfillment_id
    ? await attachDraft({ fulfillment_id, order_id }, executor)
    : method_id
      ? await chooseById({ order_id, method_id }, executor)
      : await chooseDefault({ order_id, direction, category: "SHIPMENT" }, executor);

  // Re-composed after a booking, never returned stale: `chosen` was put
  // together before the detail row existed, so it would say the order is going
  // to be collected by nobody.
  if (chosen.method.category === "PICKUP" && pickup_address_id) {
    const id = chosen.fulfillment.id;
    if (await pickups.getFor(id, executor)) {
      await pickups.update(id, { pickup_address_id, start_time }, executor);
    } else {
      await pickups.create(
        { id: randomUUID(), fulfillment_id: id, pickup_address_id, start_time },
        executor
      );
    }
    return await recompose(id, executor);
  }
  if (chosen.method.category === "DIRECT" && location_id) {
    const id = chosen.fulfillment.id;
    const is_appointment = chosen.method.type === "APPOINTMENT";
    if (await directs.getFor(id, executor)) {
      await directs.update(id, { location_id, is_appointment, start_time }, executor);
    } else {
      await directs.create(
        { id: randomUUID(), fulfillment_id: id, location_id, is_appointment, start_time },
        executor
      );
    }
    return await recompose(id, executor);
  }
  return chosen;
}

// A view of a row this transaction has just written, so "not found" is not a
// state the caller can reach - only the INNER method join can drop it, which
// assertComposed names for what it is.
async function recompose(id: string, executor?: Executor): Promise<FulfillmentView> {
  const row = await getById(id, executor);
  rules.assertComposed(row, id);
  return row;
}

// Choosing a method, from the customer's side. Admin callers go through
// chooseById instead - an admin putting an order on OWN LABEL is the reason
// OWN LABEL exists.
export async function choose(
  { order_id, method_id, direction }:
    { order_id: string; method_id: string; direction: Direction },
  executor?: Executor
): Promise<FulfillmentView> {
  await methodService.assertOffered({ method_id, direction }, executor);
  return await createFulfillment({ order_id, method_id }, executor);
}

// A method that has already been decided, by id. choose() is the CUSTOMER's
// path and checks the id against the menu; this is for a method already
// validated elsewhere (checkout intake, or an admin picking a hidden one).
export async function chooseById(
  { order_id, method_id }: { order_id: string; method_id: string },
  executor?: Executor
): Promise<FulfillmentView> {
  return await createFulfillment({ order_id, method_id }, executor);
}

// The default for a direction/category, for flows that do not ask. Both come
// from the seed, not a constant here, so changing the default is an UPDATE.
export async function chooseDefault(
  { order_id, direction, category = "SHIPMENT" }:
    { order_id: string; direction: Direction; category?: FulfillmentCategory },
  executor?: Executor
): Promise<FulfillmentView> {
  const method = await methodService.getDefault({ direction, category }, executor);
  return await createFulfillment({ order_id, method_id: method.id }, executor);
}

// updated_by_id is not a third argument - audit_stamp takes the author off the
// connection, so a status move says what moved and nothing about who.
export async function setStatus(
  { id, status }: { id: string; status: string },
  executor?: Executor
): Promise<FulfillmentView | null> {
  const changed = await fulfillments.update(id, { status }, executor);
  if (!changed) return null;
  return await getById(id, executor);
}

// Changing how an order will be handed over. The detail row goes with it -
// compose attaches all three slots, so leaving the old one behind would make
// the response carry both a pickup and a shipment with no way to tell which is
// true.
// The shipment link is deliberately NOT deleted: it points at a real
// shipping.shipments row with a paid-for label, and moving off SHIPMENT with a
// parcel still attached is refused instead. FulfillmentActions.categories is
// the same refusal, read ahead of the call.
export async function setMethod(
  { id, method_id }: { id: string; method_id: string },
  executor?: Executor
): Promise<FulfillmentView> {
  const target = await methodService.getOne(method_id, executor);
  rules.assertMethod(target, method_id);

  const current = await fulfillments.getOne(id, executor);
  rules.assertFulfillment(current, id);

  const currentMethod = await methodService.getOne(current.method_id, executor);
  if (currentMethod) {
    rules.assertMovable(currentMethod.category, target.category, {
      hasShipment: await shipmentLinks.existsFor(id, executor),
      id,
    });
  }

  await fulfillments.update(id, { method_id }, executor);

  if (target.category !== "PICKUP") await pickups.remove(id, executor);
  if (target.category !== "DIRECT") await directs.remove(id, executor);

  return await recompose(id, executor);
}

// Category is checked against the method, not trusted. A pickup row for a
// DROPSHIP fulfillment is a row every read attaches and none expects, and
// nothing in the schema would catch it.
export async function assertCategory(
  fulfillment_id: string, category: FulfillmentCategory, executor?: Executor
): Promise<void> {
  const row = await fulfillments.getOne(fulfillment_id, executor);
  rules.assertFulfillment(row, fulfillment_id);
  const method = await methodService.getOne(row.method_id, executor);
  rules.assertMethod(method, row.method_id);
  rules.assertIsCategory(method.category, category, fulfillment_id);
}

// schedulePickup/scheduleDirect/linkShipment live in the resources that own
// their tables - pickups/, directs/, shipments/. Each is one table's write plus
// assertCategory; callers reach those directly.

// Cancelling a booking removes the appointment, not the fulfillment - the order
// is still going to be fulfilled somehow, just nobody is due anywhere yet.
// This one genuinely spans children: a fulfillment carries at most one booking
// and the caller does not say which kind, so cancelling clears BOTH tables.
export async function cancelSchedule(
  fulfillment_id: string, executor?: Executor
): Promise<FulfillmentView | null> {
  await pickups.remove(fulfillment_id, executor);
  await directs.remove(fulfillment_id, executor);
  return await getById(fulfillment_id, executor);
}
