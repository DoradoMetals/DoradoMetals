// What a fulfillment means, as opposed to how it is stored.
//
// THE THIN REMAINDER (ruling 26b/26c). Every sub-resource now has its own full
// stack and orchestrates for itself - methods/, pickups/, directs/ and
// shipments/ each hold their own service, and the first three their own routes
// and controller. What is left here is what genuinely SPANS those children:
//
//   getForOrder / getById  the fulfillment row itself, composed with whichever
//                          detail row exists - the parent resource
//   getSchedule            everyone due somewhere: pickups AND directs, merged
//                          and sorted on one timeline
//   setMethod              moving between categories, which deletes the detail
//                          row of the category being left
//   cancelSchedule         a booking removed whichever of the two it was
//   assertCategory         the invariant the children check themselves against
//   choose / chooseById / chooseDefault / setStatus
//                          the fulfillment's own lifecycle
//
// The test for a handler being here is "does it span children", applied AFTER
// every child has its stack - not "does it look orchestral".
//
// THE GUARDS LIVE HERE, and after the split that is not a stylistic choice -
// every one of them is a question about a table this feature's own repo does
// not own. Whether the order exists (orders.orders), whether the method exists
// and what category it is (fulfillments.methods), whether a parcel is already
// attached (fulfillments.shipments). A repo that answered any of them would be
// reading a second table.
//
// Two rules are about the business rather than the schema, and neither is
// enforceable by a constraint:
//
//   a customer may only see and schedule their own order's fulfillment, and
//   the method a customer picks has to be one they were offered.
//
// The second is the one that matters. getAvailable filters on enabled and
// hidden, and a client that posts a method_id it was never shown - OWN LABEL,
// say, which is hidden precisely because it is an admin's decision - would
// otherwise get it. Checking the id against the same query that produced the
// menu is what makes the menu mean something.
//
// THERE IS NO exchange SIDE AND NEVER WILL BE. Fulfillments are capability
// exchange never recorded - there is no source to read from, so a *_SOURCE
// switch would have one state. That also means these are the shapes a contract
// is worth the most on: nothing else is comparing them against a second
// implementation.
import { randomUUID } from "node:crypto";
import * as fulfillments from "#features/fulfillments/repo.ts";
import * as methodService from "#features/fulfillments/methods/service.ts";
import * as pickups from "#features/fulfillments/pickups/repo.ts";
import * as directs from "#features/fulfillments/directs/repo.ts";
import * as shipmentLinks from "#features/fulfillments/shipments/repo.ts";
import * as orders from "#features/orders/repo.ts";
import * as compose from "#features/fulfillments/compose.ts";
import type { ComposedFulfillment, Details } from "#features/fulfillments/compose.ts";
import { refuse } from "#shared/http/refuse.ts";
import type { PoolClient } from "pg";
import type { fulfillments as fulfillmentTables } from "@dorado/contracts";

type Executor = PoolClient | undefined;

export type { MethodRow } from "#features/fulfillments/methods/service.ts";
// The composed shape is what every caller of this feature reads, so it keeps
// the name the old row type had.
type FulfillmentRow = ComposedFulfillment;

// DIRECTION AND CATEGORY COME FROM THE DATABASE, NOT FROM THIS FILE (D103).
//
// Both were hand-written unions here - `"purchase" | "sale"` and
// `"SHIPMENT" | "PICKUP" | "DIRECT"` - which D103 says is always one of two
// defects. Direction was the first kind: an exact duplicate of the
// `orders.direction` enum, spelled three times across the API. Category was the
// second: the column was `text NOT NULL DEFAULT 'OTHER'`, so the database
// admitted a fourth value no code here could represent, and the type was
// asserting a constraint that did not exist. Migration 098 made it a real
// fulfillments.category enum and dropped the default; these are now derived
// from the generated row, so widening the enum is a compile error rather than a
// runtime surprise.
type Direction = NonNullable<fulfillmentTables.MethodsRow["direction"]>;
type Category = fulfillmentTables.MethodsRow["category"];

// EVERY REFUSAL CARRIES A STATUS, AND THAT IS WHY THE MESSAGES ARE WORTH
// WRITING.
//
// shared/middleware/errorHandler.js shows a message to the caller only when the
// error carries a deliberate 4xx - "an error raised deliberately is different:
// it was written to be read, and its status says so". These were bare
// `new Error`, so every one arrived as a generic 500 "Server error" and the
// explanation went to the log instead of to the admin who needed it. An admin
// trying to move an order off SHIPMENT was told "Server error" rather than
// "cancel the shipment first".
//
// 404 for "that does not exist", 409 for "the current state forbids this".
// refuse() is shared/http/refuse.ts now - the same three lines lived here, in
// features/orders/patch.service.ts and in features/checkout/service.ts, and the
// 26c factoring would have made it five copies.

// ------------------------------------------------------------- composition

// The details of a set of fulfillments, one read per table rather than a query
// per row or four joins per query.
async function detailsFor(
  rows: fulfillments.FulfillmentBaseRow[], executor?: Executor
): Promise<Details> {
  const ids = rows.map((f) => f.id);
  const [methods, p, d, s] = await Promise.all([
    methodService.byId(executor),
    pickups.getMany(ids, executor),
    directs.getMany(ids, executor),
    shipmentLinks.getMany(ids, executor),
  ]);
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

// THE METHODS SECTION MOVED to features/fulfillments/methods/service.ts
// (ruling 26b: "Checkout will call fulfillment methods... we need to hit the
// fulfillment/methods/controller.ts"). listMethods/listAllMethods/updateMethod
// are listAvailable/listAll/update there, and the offered-method check that
// made the customer menu mean something is assertOffered.

// ------------------------------------------------------------------- reads

// A fulfillment carries no user of its own, so "is this yours" is a question
// about the order. requireUser alone would have let any signed-in customer read
// any order's pickup address and appointment time by changing a query string -
// the same class of hole as an unguarded route, and invisible from the routes
// file because the guard is present and simply not enough.
//
// Returns null for "not yours" as well as "not found", deliberately: telling
// the two apart would confirm the order exists.
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

// Everything an employee is expected to turn up for: the scheduled pickups and
// appointments, soonest first.
//
// SHIPMENTS ARE EXCLUDED, and that falls out of the shape rather than needing a
// category filter: this reads the pickups and directs tables, so a fulfillment
// with neither is not in the answer. Nobody is due anywhere for a parcel, which
// is the whole point of the category split.
//
// The implementation this replaces filtered `m.category IN ('PICKUP','DIRECT')`
// against four joined tables and sorted on `coalesce(p.start_time,
// d.start_time)`. Both halves move: the filter becomes which tables are read,
// and the sort becomes compose.byStartTimeThenId, which keeps NULLS LAST.
export async function getSchedule(
  filters: { from?: string; to?: string; employee_id?: string } = {},
  executor?: Executor
): Promise<ComposedFulfillment[]> {
  const [p, d] = await Promise.all([
    pickups.getScheduled(filters, executor),
    directs.getScheduled(filters, executor),
  ]);

  const ids = [...new Set([...p, ...d].map((r) => r.fulfillment_id))];
  if (ids.length === 0) return [];

  const rows = await fulfillments.getMany(ids, executor);
  return compose.composeAll(rows, await detailsFor(rows, executor))
    .sort(compose.byStartTimeThenId);
}

// ------------------------------------------------------------------ writes

// THE ORDER MUST EXIST IN THE NEW SCHEMA. order_id references orders.orders,
// which is populated by backfill and kept current by the orders dual-write. So
// creating a fulfillment for an order that only exists in exchange fails on the
// foreign key, and it should: a fulfillment pointing at an order nobody can
// find is worse than a refusal.
//
// The check is here rather than left to the constraint because
// 'insert or update on table "fulfillments" violates foreign key constraint'
// tells the caller nothing about what to do next.
async function createFulfillment(
  { order_id, method_id, status = "PENDING", created_by_id = null }:
    { order_id: string; method_id: string; status?: string; created_by_id?: string | null },
  executor?: Executor
): Promise<ComposedFulfillment | null> {
  if (!(await orders.exists(order_id, executor))) {
    throw refuse(
      409,
      `cannot fulfill order ${order_id}: it is not in orders.orders. ` +
        `Orders reach the new schema through the orders dual-write, so this ` +
        `order exists only in exchange.`
    );
  }

  const made = await fulfillments.create(
    randomUUID(), order_id, method_id, status, created_by_id, executor
  );
  // No row means the order already had one - ON CONFLICT DO NOTHING - which is
  // the normal case for a second call rather than an error.
  const row = made ?? (await fulfillments.getByOrder(order_id, executor));
  return await composeOne(row, executor);
}

// Choosing a method, from the customer's side. Admin callers go through
// chooseById, which is why the offered-method check is here and not shared: an
// admin putting an order on OWN LABEL is the reason OWN LABEL exists.
export async function choose(
  { order_id, method_id, direction, created_by_id }:
    { order_id: string; method_id: string; direction: Direction; created_by_id?: string | null },
  executor?: Executor
): Promise<ComposedFulfillment | null> {
  await methodService.assertOffered({ method_id, direction }, executor);
  return await createFulfillment({ order_id, method_id, created_by_id }, executor);
}

// A method that has already been decided, by id.
//
// choose() is the CUSTOMER's path and checks the id against the same query that
// produced the menu, which is what makes the menu mean something. This is the
// path for a method that was already validated - recorded on a checkout at
// intake, or picked by an admin who is allowed the hidden ones. Skipping the
// menu check here is the difference between the two, and it is why they are two
// functions rather than a flag.
export async function chooseById(
  { order_id, method_id, created_by_id }:
    { order_id: string; method_id: string; created_by_id?: string | null },
  executor?: Executor
): Promise<ComposedFulfillment | null> {
  return await createFulfillment({ order_id, method_id, created_by_id }, executor);
}

// The default for a direction and category, for the flows that do not ask.
// A sale with nothing chosen is a DROPSHIP; a purchase with nothing chosen is a
// CARRIER DROPOFF. Both come from the seed rather than from a constant here, so
// changing the business's default is an UPDATE rather than a deploy.
export async function chooseDefault(
  { order_id, direction, category = "SHIPMENT", created_by_id }:
    {
      order_id: string; direction: Direction;
      category?: Category; created_by_id?: string | null;
    },
  executor?: Executor
): Promise<ComposedFulfillment | null> {
  const method = await methodService.getDefault({ direction, category }, executor);
  return await createFulfillment(
    { order_id, method_id: method.id, created_by_id }, executor
  );
}

export async function setStatus(
  { id, status, updated_by_id = null }:
    { id: string; status: string; updated_by_id?: string | null },
  executor?: Executor
): Promise<ComposedFulfillment | null> {
  const row = await fulfillments.setStatus(id, status, updated_by_id, executor);
  return await composeOne(row, executor);
}

// Changing how an order will be handed over.
//
// THE DETAIL ROW GOES WITH IT. A fulfillment that was a PICKUP and becomes a
// SHIPMENT still has its pickups row otherwise, and compose.ts attaches all
// three slots - so the response would carry both a pickup and a shipment and
// the caller would have to guess which one is true. Nothing in the schema
// prevents that; this does.
//
// THE SHIPMENT LINK IS DELIBERATELY NOT DELETED. It points at a real
// shipping.shipments row with a tracking number and a label that was paid for,
// and a parcel does not stop existing because somebody changed a dropdown.
// Moving off SHIPMENT with a parcel still attached is refused instead, because
// cancelling the shipment is a different decision that costs money and belongs
// to features/shipping.
export async function setMethod(
  { id, method_id, updated_by_id = null }:
    { id: string; method_id: string; updated_by_id?: string | null },
  executor?: Executor
): Promise<ComposedFulfillment | null> {
  const target = await methodService.getOne(method_id, executor);
  if (!target) throw refuse(404, `no such fulfillment method: ${method_id}`);

  const current = await fulfillments.getOne(id, executor);
  if (!current) throw refuse(404, `no such fulfillment: ${id}`);

  const currentMethod = await methodService.getOne(current.method_id, executor);
  if (
    currentMethod?.category === "SHIPMENT" &&
    target.category !== "SHIPMENT" &&
    (await shipmentLinks.existsFor(id, executor))
  ) {
    throw refuse(
      409,
      `fulfillment ${id} already has a shipment - cancel it through features/shipping ` +
        `before moving the order off SHIPMENT`
    );
  }

  await fulfillments.setMethod(id, method_id, updated_by_id, executor);

  if (target.category !== "PICKUP") await pickups.remove(id, executor);
  if (target.category !== "DIRECT") await directs.remove(id, executor);

  return await getById(id, executor);
}

// The category is checked against the method rather than trusted. Writing a
// pickup row for a fulfillment whose method is DROPSHIP produces a row every
// read attaches and no read expects, and the constraint that would have caught
// it does not exist in the schema.
export async function assertCategory(
  fulfillment_id: string, category: Category, executor?: Executor
): Promise<void> {
  const row = await fulfillments.getOne(fulfillment_id, executor);
  if (!row) throw refuse(404, `no such fulfillment: ${fulfillment_id}`);
  const method = await methodService.getOne(row.method_id, executor);
  const found = method?.category;
  if (!found) throw refuse(404, `no such fulfillment: ${fulfillment_id}`);
  if (found !== category) {
    throw refuse(
      409,
      `fulfillment ${fulfillment_id} is a ${found}, not a ${category} - ` +
        `change the method before scheduling`
    );
  }
}

// schedulePickup / scheduleDirect / linkShipment MOVED to the resources that
// own their tables - fulfillments/pickups/service.ts, fulfillments/directs/
// service.ts and fulfillments/shipments/service.ts. Each is one table's write
// plus assertCategory, which is exactly the shape ruling 26c describes; the
// callers (features/orders/create.ts, features/shipping/shipments/service.ts)
// reach those directly rather than through this file.

// Cancelling a booking removes the appointment, not the fulfillment. The order
// is still going to be fulfilled somehow; what changed is that nobody is due
// anywhere yet.
//
// THIS ONE GENUINELY SPANS CHILDREN, which is why it stays: a fulfillment
// carries at most one booking and the caller does not say which kind it was, so
// cancelling means clearing BOTH tables. Pushing it into either child would
// leave the other's row behind.
export async function cancelSchedule(
  fulfillment_id: string, executor?: Executor
): Promise<ComposedFulfillment | null> {
  await pickups.remove(fulfillment_id, executor);
  await directs.remove(fulfillment_id, executor);
  return await getById(fulfillment_id, executor);
}
