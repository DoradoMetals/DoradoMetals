// The parts of fulfillments that need no database: the statements as text, and
// the in-memory join that replaced four SQL ones.
//
// This feature has no exchange side, so there is no `diff` and no second
// implementation to compare against. These and the database tests are the only
// thing that says the composition produces what the four joins produced.
import test from "node:test";
import assert from "node:assert/strict";
import { sqlFrom } from "#shared/db/sql.ts";
import {
  compose, composeAll, byFulfillment, byStartTimeThenId, toWire,
} from "#domain/fulfillments/compose.ts";
import type { Details } from "#domain/fulfillments/compose.ts";

// The statements are db/fulfillments (Phase 0c moved repo + sql there; these
// tests stayed in domain/ alongside compose.ts).
const here = new URL("../../../db/fulfillments/", import.meta.url).pathname;
const sql = sqlFrom(here);
const methodsSql = sqlFrom(`${here}/methods`);
const pickupsSql = sqlFrom(`${here}/pickups`);
const directsSql = sqlFrom(`${here}/directs`);
const linksSql = sqlFrom(`${here}/shipments`);

const strip = (text: string): string =>
  text.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

test("every statement loads and is not empty", () => {
  for (const n of ["get_one", "get_by_order", "get_many", "create", "set_status", "set_method"]) {
    assert.ok(sql(n).trim().length > 0, `${n} is empty`);
  }
  for (const n of ["get_available", "get_all", "get_one", "get_default", "update"]) {
    assert.ok(methodsSql(n).trim().length > 0, `methods/${n} is empty`);
  }
  for (const n of ["get_for", "get_many", "get_scheduled", "upsert", "delete"]) {
    assert.ok(pickupsSql(n).trim().length > 0, `pickups/${n} is empty`);
    assert.ok(directsSql(n).trim().length > 0, `directs/${n} is empty`);
  }
  for (const n of ["get_for", "get_many", "get_by_shipment", "exists_for", "upsert"]) {
    assert.ok(linksSql(n).trim().length > 0, `shipments/${n} is empty`);
  }
});

// ONE TABLE PER REPO. This is the property the split exists for, and it is the
// one a future edit is most likely to undo - adding a join back is easy and
// looks like an optimisation.
test("no statement joins a second table", () => {
  const all: [string, string][] = [
    ...["get_one", "get_by_order", "get_many", "create", "set_status", "set_method"]
      .map((n) => [`fulfillments/${n}`, sql(n)] as [string, string]),
    ...["get_available", "get_all", "get_one", "get_default", "update"]
      .map((n) => [`methods/${n}`, methodsSql(n)] as [string, string]),
    ...["get_for", "get_many", "get_scheduled", "upsert", "delete"]
      .flatMap((n) => [
        [`pickups/${n}`, pickupsSql(n)] as [string, string],
        [`directs/${n}`, directsSql(n)] as [string, string],
      ]),
    ...["get_for", "get_many", "get_by_shipment", "exists_for", "upsert"]
      .map((n) => [`shipments/${n}`, linksSql(n)] as [string, string]),
  ];

  assert.ok(all.length >= 26, `only ${all.length} statements found - the walk broke`);
  for (const [name, text] of all) {
    assert.doesNotMatch(strip(text), /\bJOIN\b/i, `${name} joins a second table`);
  }
});

// The method's enum lives in `orders`, not in `fulfillments`, because a
// direction is a property of the order rather than of how it is handed over.
// An unqualified cast raises 42704 at runtime and nothing else would catch it.
test("the direction cast is schema-qualified", () => {
  for (const n of ["get_available", "get_default"]) {
    assert.match(strip(methodsSql(n)), /\$1::orders\.direction/,
      `methods/${n} casts direction without naming the schema`);
  }
});

// The method table has no create and no delete, deliberately - the three
// categories are code rather than data.
test("methods offers no way to invent a category", () => {
  const names = ["get_available", "get_all", "get_one", "get_default", "update"];
  for (const n of names) {
    assert.doesNotMatch(strip(methodsSql(n)), /INSERT INTO|DELETE FROM/i,
      `methods/${n} creates or deletes a method`);
  }
});

// The update COALESCEs every field, so a partial update - which is what every
// admin toggle sends - leaves the rest alone.
test("the method update is partial, not a full overwrite", () => {
  const body = strip(methodsSql("update"));
  for (const col of ["label", "admin_label", "enabled", "hidden"]) {
    assert.match(body, new RegExp(`${col}\\s*=\\s*coalesce\\(`, "i"),
      `methods/update overwrites ${col} instead of coalescing it`);
  }
  // type, category and direction are what the code dispatches on. Changing a
  // method's category would move existing fulfillments to a detail table their
  // rows are not in.
  for (const col of ["type", "category", "direction"]) {
    assert.doesNotMatch(body, new RegExp(`\\b${col}\\s*=`, "i"),
      `methods/update writes ${col}, which the code dispatches on`);
  }
});

// Both booking statements are upserts, because rescheduling is the common case
// and each table holds one row per fulfillment.
test("booking a pickup or an appointment is an upsert", () => {
  for (const [what, s] of [["pickups", pickupsSql], ["directs", directsSql]] as const) {
    assert.match(strip(s("upsert")), /ON CONFLICT \(fulfillment_id\) DO UPDATE/i,
      `${what}/upsert would insert a second row instead of rescheduling`);
  }
});

// create is ON CONFLICT DO NOTHING - one fulfillment per order is the rule, not
// a race to lose.
test("creating a fulfillment for an order that has one does nothing", () => {
  assert.match(strip(sql("create")), /ON CONFLICT \(order_id\) DO NOTHING/i);
});

// ---------------------------------------------------------------- compose.ts

const base = (over = {}) =>
  ({ id: "f1", order_id: "o1", method_id: "m1", status: "PENDING", ...over }) as never;

const method = (over = {}) =>
  ({
    id: "m1", type: "PICKUP", label: "Pickup", admin_label: "Dorado Pickup",
    category: "PICKUP", direction: "purchase", enabled: true, hidden: false,
    is_default: false, created_at: null, updated_at: null, ...over,
  }) as never;

const details = (over: Partial<Details> = {}): Details => ({
  methods: new Map([["m1", method()]]),
  pickups: new Map(),
  directs: new Map(),
  shipmentLinks: new Map(),
  ...over,
});

test("a fulfillment carries its method nested INTERNALLY, and toWire strips to the bare row", () => {
  const out = compose(base(), details());
  assert.ok(out);
  // Internal: the service's own logic branches on the category.
  assert.equal(out.method.category, "PICKUP");
  assert.equal(out.method_id, "m1", "method_id is part of the verbatim row now");

  // The WIRE is the bare fulfillments.fulfillments row and nothing else
  // (wave-2 final form): no method object, no child rows.
  const wire = toWire(out);
  assert.ok(!("method" in wire), "the method object reached the wire");
  assert.ok(!("pickup" in wire), "a child row reached the wire");
  assert.ok(!("direct" in wire), "a child row reached the wire");
  assert.ok(!("shipment" in wire), "a child row reached the wire");
  assert.equal(wire.method_id, "m1");
  assert.equal(wire.order_id, "o1");
});

// THE METHOD JOIN WAS INNER. A fulfillment whose method row is gone is dropped
// rather than returned with a null where every caller reads a category.
test("a fulfillment with no method is dropped", () => {
  assert.equal(compose(base({ method_id: "gone" }), details()), null);
  // The control, so the above is not passing because compose keeps nothing.
  assert.ok(compose(base(), details()));
});

// THE THREE DETAIL JOINS WERE OUTER. A PICKUP nobody has scheduled yet is the
// normal state of a new order, not a reason to drop it.
test("a fulfillment with no detail keeps three nulls", () => {
  const out = compose(base(), details());
  assert.ok(out);
  assert.equal(out.pickup, null);
  assert.equal(out.direct, null);
  assert.equal(out.shipment, null);
});

test("a booked pickup is nested under its own key and the others stay null", () => {
  const p = {
    id: "p1", fulfillment_id: "f1", pickup_address_id: "a1",
    assigned_employee_id: null, start_time: null, end_time: null,
  } as never;
  const out = compose(base(), details({ pickups: byFulfillment([p]) }));
  assert.ok(out);
  assert.equal(out.pickup?.pickup_address_id, "a1");
  assert.equal(out.direct, null);
  assert.equal(out.shipment, null);
  // The child is the VERBATIM repo row now (wave-2 final form) - and it is
  // INTERNAL: toWire strips it before anything reaches a response.
  assert.equal(out.pickup?.fulfillment_id, "f1");
});

test("composeAll drops what compose drops and keeps the rest", () => {
  const rows = [base({ id: "f1" }), base({ id: "f2", method_id: "gone" })];
  assert.deepEqual(composeAll(rows, details()).map((f) => f.id), ["f1"]);
});

// ORDER BY coalesce(p.start_time, d.start_time) ASC NULLS LAST, f.id ASC.
//
// NULLS LAST is the part worth keeping deliberately: an unscheduled pickup is
// work to be BOOKED, not work happening now, and a plain sort puts it first.
test("the schedule sorts by start time with unscheduled work last", () => {
  const at = (id: string, start: string | null) => {
    const d = details({
      pickups: byFulfillment([
        { id: `p-${id}`, fulfillment_id: id, pickup_address_id: "a1",
          assigned_employee_id: null, start_time: start, end_time: null } as never,
      ]),
    });
    return compose(base({ id }), d);
  };

  const rows = [
    at("f3", null),
    at("f2", "2026-09-02T15:00:00Z"),
    at("f1", "2026-09-01T09:00:00Z"),
    at("f0", null),
  ].filter((r) => r !== null);

  assert.deepEqual(
    [...rows].sort(byStartTimeThenId).map((r) => r.id),
    ["f1", "f2", "f0", "f3"],
    "unscheduled work did not sort last, or the id tiebreak was lost"
  );
});

// A pickup and a direct both carry start_time, and the sort takes whichever is
// present - the coalesce the old ORDER BY did.
test("the sort reads a direct's start time as well as a pickup's", () => {
  const withDirect = compose(base({ id: "d1" }), details({
    directs: byFulfillment([
      { id: "x", fulfillment_id: "d1", location_id: "l1", assigned_employee_id: null,
        is_appointment: true, start_time: "2026-09-01T08:00:00Z", end_time: null } as never,
    ]),
  }));
  const withPickup = compose(base({ id: "p1" }), details({
    pickups: byFulfillment([
      { id: "y", fulfillment_id: "p1", pickup_address_id: "a1", assigned_employee_id: null,
        start_time: "2026-09-01T09:00:00Z", end_time: null } as never,
    ]),
  }));
  assert.ok(withDirect && withPickup);
  assert.deepEqual(
    [withPickup, withDirect].sort(byStartTimeThenId).map((r) => r.id),
    ["d1", "p1"],
    "the direct's start time was ignored by the sort"
  );
});
