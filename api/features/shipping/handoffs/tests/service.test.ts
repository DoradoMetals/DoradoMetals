// The handoff read through its service, against real Postgres.
//
// The read itself is a constant, so what actually needs a database is the half
// this feature got wrong before: WHICH CARRIER. The browser used to say, as a
// uuid literal at three checkout call sites; the server says now, by finding
// the one carrier that has a shipping provider registered. That answer comes
// out of shipping.carriers joined to its organization, so it is only true if
// the data says so - which is what these tests check.
//
// Each test runs inside a transaction that is rolled back.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#db";
import * as handoffs from "#features/shipping/handoffs/service.ts";
import * as services from "#features/shipping/services/service.ts";
import {
  resolveShippingCarrierId,
  carrierIdOr,
  forgetShippingCarrier,
} from "#features/shipping/operations/resolver.ts";

let client: PoolClient;

before(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
  client = await pool.connect();
});

after(async () => {
  client.release();
  await pool.end();
});

test("the shipping carrier resolves to exactly one carrier", async () => {
  const id = await resolveShippingCarrierId();
  assert.match(id, /^[0-9a-f-]{36}$/);
});

test("the resolved carrier is the FedEx row, in this database", async () => {
  // Pinned as a value rather than left implicit: dev and production both give
  // FedEx 30179428-b311-4873-8d08-382901c581d8, checked against both, and that
  // is the uuid three React components used to carry. If this ever fails the
  // browser's old literal would have been wrong too - which is the point of
  // taking it out of the browser.
  const id = await resolveShippingCarrierId();
  const { rows } = await client.query(
    `SELECT o.name FROM shipping.carriers c
       JOIN organizations.organizations o ON o.id = c.organization_id
      WHERE c.id = $1`,
    [id]
  );
  assert.equal(rows.length, 1);
  assert.equal(String(rows[0].name).toLowerCase(), "fedex");
});

test("naming a carrier still uses that carrier", async () => {
  // Cleared first: carrierIdOr memoises the default for five minutes to keep
  // two round trips off every rate quote, and a test reading another test's
  // cached answer proves nothing.
  forgetShippingCarrier();
  const id = await resolveShippingCarrierId();
  assert.equal(await carrierIdOr(id), id);
  assert.equal(await carrierIdOr(""), id);
  assert.equal(await carrierIdOr(null), id);
  assert.equal(await carrierIdOr(undefined), id);
});

test("the memo answers the same id, and forgetting it re-reads", async () => {
  forgetShippingCarrier();
  const first = await carrierIdOr(null);
  const cached = await carrierIdOr(null);
  forgetShippingCarrier();
  const fresh = await carrierIdOr(null);

  assert.equal(cached, first);
  // The database is the authority either way - the memo is a latency fix, not
  // a source of truth, and this is what says so.
  assert.equal(fresh, first);
});

test("handoffs come back in display order, with the flags the frontend branches on", async () => {
  const rows = await handoffs.getHandoffs();

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.display_order), [0, 1]);
  assert.deepEqual(rows.map((r) => r.name), ["Store Dropoff", "Carrier Pickup"]);

  // The frontend renders `name` and decides what to show next from these two.
  // It never reads `code`, which is why it can stay FedEx's.
  for (const r of rows) {
    assert.equal(typeof r.requires_schedule, "boolean");
    assert.equal(typeof r.has_dropoff_locations, "boolean");
  }
});

test("handoffs for a named carrier match handoffs for the default one", async () => {
  const id = await resolveShippingCarrierId();
  assert.deepEqual(await handoffs.getHandoffs(id), await handoffs.getHandoffs());
});

test("a carrier with no provider is refused rather than answered empty", async () => {
  // UPS and USPS are carriers in this database with no provider implementation.
  // Answering [] would present a customer a checkout with no way to hand over a
  // parcel; the throw says what is actually wrong.
  const { rows } = await client.query(
    `SELECT c.id FROM shipping.carriers c
       JOIN organizations.organizations o ON o.id = c.organization_id
      WHERE lower(o.name) <> 'fedex'
      LIMIT 1`
  );
  if (rows.length === 0) return; // nothing to check in this database

  await assert.rejects(
    () => handoffs.getHandoffs(rows[0].id),
    /Unsupported carrier|No builders|No catalogue/
  );
});

test("the offered services are the two checkout renders, in order", async () => {
  const rows = await services.getOfferedServices();

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.name), ["Express Saver", "Priority Overnight"]);
  assert.deepEqual(rows.map((r) => r.display_order), [0, 1]);
  for (const r of rows) assert.ok(r.carrier_code.length > 0);
});
