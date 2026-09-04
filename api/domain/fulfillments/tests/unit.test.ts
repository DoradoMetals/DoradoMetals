// The parts of fulfillments that need no database: the statements as text, and the in-memory join that replaced four SQL ones.
// No exchange side, so no `diff` and no second implementation to compare against - these and the database tests are the only proof the composition produces what the four joins did.
import { test } from "vitest";
import assert from "node:assert/strict";
import { sqlFrom } from "#shared/db/sql.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { PATCHABLE } from "#db/fulfillments/repo.ts";
import { PATCHABLE as METHOD_PATCHABLE } from "#db/fulfillments/methods/repo.ts";
import { PATCHABLE as PICKUP_PATCHABLE } from "#db/fulfillments/pickups/repo.ts";
import { PATCHABLE as DIRECT_PATCHABLE } from "#db/fulfillments/directs/repo.ts";
import { PATCHABLE as LINK_PATCHABLE } from "#db/fulfillments/shipments/repo.ts";

// fulfillments/sql/update.sql and methods/sql/update.sql are gone - both were COALESCE statements that also wrote updated_at/updated_by_id by hand; shared/db/patch.ts builds them from the column lists the repos export, and audit_stamp writes the audit columns.
const builtFulfillment = () =>
  buildUpdate({
    table: "fulfillments.fulfillments", allowed: PATCHABLE,
    patch: { status: "COMPLETED", method_id: "m" }, where: { id: "x" },
  })!.text;

const builtMethod = () =>
  buildUpdate({
    table: "fulfillments.methods", allowed: METHOD_PATCHABLE,
    patch: Object.fromEntries(METHOD_PATCHABLE.map((c) => [c as string, null])),
    where: { id: "x" },
  })!.text;

// pickups/directs upsert.sql and shipments upsert.sql are gone too (D214 item
// 11): the service reads first and calls create or this same builder.
const builtPickup = () =>
  buildUpdate({
    table: "fulfillments.pickups", allowed: PICKUP_PATCHABLE,
    patch: { pickup_address_id: "a" }, where: { fulfillment_id: "f1" },
  })!.text;

const builtDirect = () =>
  buildUpdate({
    table: "fulfillments.directs", allowed: DIRECT_PATCHABLE,
    patch: { location_id: "l" }, where: { fulfillment_id: "f1" },
  })!.text;

const builtLink = () =>
  buildUpdate({
    table: "fulfillments.shipments", allowed: LINK_PATCHABLE,
    patch: { recipient_location_id: "r" }, where: { shipment_id: "s1" },
  })!.text;
import {
  compose, composeAll, byFulfillment,
} from "#domain/fulfillments/compose.ts";
import { byStartTimeThenId } from "#domain/fulfillments/rules.ts";
import type {
  FulfillmentDirect, FulfillmentMethodRead, FulfillmentPickup, FulfillmentShipment,
} from "@dorado/contracts";

// compose.ts and service.ts each inline this shape rather than naming it (it
// is a bag of four entities' Maps, not a derivation of one) - the test needs
// its own copy to type `details()` below.
type Details = {
  methods: Map<string, FulfillmentMethodRead>;
  pickups: Map<string, FulfillmentPickup>;
  directs: Map<string, FulfillmentDirect>;
  shipmentLinks: Map<string, FulfillmentShipment[]>;
};

// The statements are in db/fulfillments; these tests stay in domain/ alongside compose.ts.
const here = new URL("../../../db/fulfillments/", import.meta.url).pathname;
const sql = sqlFrom(here);
const methodsSql = sqlFrom(`${here}/methods`);
const pickupsSql = sqlFrom(`${here}/pickups`);
const directsSql = sqlFrom(`${here}/directs`);
const linksSql = sqlFrom(`${here}/shipments`);

const strip = (text: string): string =>
  text.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

test("every statement loads and is not empty", () => {
  for (const n of ["get_one", "get_by_order", "get_many", "create"]) {
    assert.ok(sql(n).trim().length > 0, `${n} is empty`);
  }
  for (const n of ["get_available", "get_all", "get_one", "get_default"]) {
    assert.ok(methodsSql(n).trim().length > 0, `methods/${n} is empty`);
  }
  assert.ok(builtFulfillment().trim().length > 0, "the built fulfillments UPDATE is empty");
  assert.ok(builtMethod().trim().length > 0, "the built methods UPDATE is empty");
  for (const n of ["get_for", "get_many", "get_scheduled", "create", "delete"]) {
    assert.ok(pickupsSql(n).trim().length > 0, `pickups/${n} is empty`);
    assert.ok(directsSql(n).trim().length > 0, `directs/${n} is empty`);
  }
  assert.ok(builtPickup().trim().length > 0, "the built pickups UPDATE is empty");
  assert.ok(builtDirect().trim().length > 0, "the built directs UPDATE is empty");
  for (const n of ["get_for", "get_many", "get_by_shipment", "exists_for", "create"]) {
    assert.ok(linksSql(n).trim().length > 0, `shipments/${n} is empty`);
  }
  assert.ok(builtLink().trim().length > 0, "the built shipments UPDATE is empty");
});

// One table per repo - the property the split exists for, and the one a future edit is most likely to undo: adding a join back is easy and looks like an optimisation.
test("no statement joins a second table", () => {
  const all: [string, string][] = [
    ...["get_one", "get_by_order", "get_many", "create"]
      .map((n) => [`fulfillments/${n}`, sql(n)] as [string, string]),
    ...["get_available", "get_all", "get_one", "get_default"]
      .map((n) => [`methods/${n}`, methodsSql(n)] as [string, string]),
    ["fulfillments/update", builtFulfillment()] as [string, string],
    ["methods/update", builtMethod()] as [string, string],
    ...["get_for", "get_many", "get_scheduled", "create", "delete"]
      .flatMap((n) => [
        [`pickups/${n}`, pickupsSql(n)] as [string, string],
        [`directs/${n}`, directsSql(n)] as [string, string],
      ]),
    ["pickups/update", builtPickup()] as [string, string],
    ["directs/update", builtDirect()] as [string, string],
    ...["get_for", "get_many", "get_by_shipment", "exists_for", "create"]
      .map((n) => [`shipments/${n}`, linksSql(n)] as [string, string]),
    ["shipments/update", builtLink()] as [string, string],
  ];

  // 28: set_status.sql and set_method.sql (the same UPDATE under two names)
  // collapsed into one update.sql, and pickups/directs/shipments each traded
  // their upsert.sql for a create.sql plus one built update (D214 item 11).
  assert.ok(all.length >= 28, `only ${all.length} statements found - the walk broke`);
  for (const [name, text] of all) {
    assert.doesNotMatch(strip(text), /\bJOIN\b/i, `${name} joins a second table`);
  }
});

// The direction enum lives in `orders`, not `fulfillments` - an unqualified cast raises 42704 at runtime and nothing else would catch it.
test("the direction cast is schema-qualified", () => {
  for (const n of ["get_available", "get_default"]) {
    assert.match(strip(methodsSql(n)), /\$1::orders\.direction/,
      `methods/${n} casts direction without naming the schema`);
  }
});

// The method table has no create and no delete, deliberately - the three
// categories are code rather than data.
test("methods offers no way to invent a category", () => {
  for (const n of ["get_available", "get_all", "get_one", "get_default"]) {
    assert.doesNotMatch(strip(methodsSql(n)), /INSERT INTO|DELETE FROM/i,
      `methods/${n} creates or deletes a method`);
  }
  assert.doesNotMatch(builtMethod(), /INSERT INTO|DELETE FROM/i,
    "methods/update creates or deletes a method");
});

// Partial, by a route that can't be wrong about it: shared/db/patch.ts gets "leaves the rest alone" from the column never entering the SET list - the admin toggle that sends only `hidden` produces a one-column UPDATE.
test("the method update is partial, not a full overwrite", () => {
  const one = buildUpdate({
    table: "fulfillments.methods", allowed: METHOD_PATCHABLE,
    patch: { hidden: true }, where: { id: "x" },
  })!;
  assert.match(one.text, /SET hidden = \$1\b/);
  for (const col of ["label", "admin_label", "enabled"]) {
    assert.doesNotMatch(one.text, new RegExp(`\\b${col}\\b`),
      `methods/update touches ${col} on a patch that never named it`);
  }

  // type/category/direction are what the code dispatches on - not in METHOD_PATCHABLE, so the builder throws rather than writing a column outside the whitelist.
  for (const col of ["type", "category", "direction"]) {
    assert.doesNotMatch(builtMethod(), new RegExp(`\\b${col}\\s*=`, "i"),
      `methods/update writes ${col}, which the code dispatches on`);
    assert.throws(() => buildUpdate({
      table: "fulfillments.methods", allowed: METHOD_PATCHABLE,
      patch: { [col]: "x" }, where: { id: "x" },
    }), /is not a patchable column/, `${col} is patchable`);
  }
});

// Booking reads first now (D214 item 11): create is a genuine INSERT, no
// ON CONFLICT left to fall back on, because the service checks for an
// existing row before choosing create or update.
test("pickups, directs and shipments create with no conflict handling", () => {
  for (const [what, text] of [
    ["pickups", strip(pickupsSql("create"))],
    ["directs", strip(directsSql("create"))],
    ["shipments", strip(linksSql("create"))],
  ] as const) {
    assert.doesNotMatch(text, /ON CONFLICT/i, `${what}/create still upserts`);
  }
});

// Rescheduling is a PATCH of the one row each holds, keyed by the column that
// makes it unique - fulfillment_id for pickups/directs, shipment_id for the
// link table (a fulfillment may carry several parcels).
test("pickups/directs update key on fulfillment_id, shipments on shipment_id", () => {
  assert.match(builtPickup(), /WHERE fulfillment_id = \$2/);
  assert.match(builtDirect(), /WHERE fulfillment_id = \$2/);
  assert.match(builtLink(), /WHERE shipment_id = \$2/);
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

test("a fulfillment carries its bare row separately from its nested method", () => {
  const out = compose(base(), details());
  assert.ok(out);
  // Internal: the service's own logic branches on the category.
  assert.equal(out.method.category, "PICKUP");
  assert.equal(out.fulfillment.method_id, "m1", "method_id is part of the verbatim row");
  assert.equal(out.fulfillment.order_id, "o1");
  assert.equal(out.fulfillment.id, "f1");
});

// THE METHOD JOIN WAS INNER. A fulfillment whose method row is gone is dropped
// rather than returned with a null where every caller reads a category.
test("a fulfillment with no method is dropped", () => {
  assert.equal(compose(base({ method_id: "gone" }), details()), null);
  // The control, so the above is not passing because compose keeps nothing.
  assert.ok(compose(base(), details()));
});

// The three detail joins were OUTER - a PICKUP nobody has scheduled yet is the normal state of a new order, not a reason to drop it.
test("a fulfillment with no detail keeps three nulls", () => {
  const out = compose(base(), details());
  assert.ok(out);
  assert.equal(out.pickup, null);
  assert.equal(out.direct, null);
  assert.deepEqual(out.shipments, []);
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
  assert.deepEqual(out.shipments, []);
  // The child is the VERBATIM repo row, and it's INTERNAL - toWire strips it before anything reaches a response.
  assert.equal(out.pickup?.fulfillment_id, "f1");
});

test("composeAll drops what compose drops and keeps the rest", () => {
  const rows = [base({ id: "f1" }), base({ id: "f2", method_id: "gone" })];
  assert.deepEqual(composeAll(rows, details()).map((f) => f.fulfillment.id), ["f1"]);
});

// NULLS LAST kept deliberately: an unscheduled pickup is work to be BOOKED, not happening now, and a plain sort would put it first.
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
    [...rows].sort(byStartTimeThenId).map((r) => r.fulfillment.id),
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
    [withPickup, withDirect].sort(byStartTimeThenId).map((r) => r.fulfillment.id),
    ["d1", "p1"],
    "the direct's start time was ignored by the sort"
  );
});
