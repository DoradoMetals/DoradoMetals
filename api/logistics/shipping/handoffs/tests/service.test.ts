import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#pool";
import * as handoffs from "#logistics/shipping/handoffs/service.ts";
import * as services from "#logistics/shipping/services/service.ts";
import {
  resolveShippingCarrierId,
  carrierIdOr,
  forgetShippingCarrier,
} from "#logistics/shipping/operations/resolver.ts";

let client: PoolClient;

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
  client = await pool.connect();
});

afterAll(async () => {
  client.release();
  await pool.end();
});

test("the shipping carrier resolves to exactly one carrier", async () => {
  const id = await resolveShippingCarrierId();
  assert.match(id, /^[0-9a-f-]{36}$/);
});

test("the resolved carrier is the FedEx row, in this database", async () => {
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
  assert.equal(fresh, first);
});

test("handoffs come back in display order, with the flags the frontend branches on", async () => {
  const rows = await handoffs.getHandoffs();

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.display_order), [0, 1]);
  assert.deepEqual(rows.map((r) => r.name), ["Store Dropoff", "Carrier Pickup"]);

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
  const { rows } = await client.query(
    `SELECT c.id FROM shipping.carriers c
       JOIN organizations.organizations o ON o.id = c.organization_id
      WHERE lower(o.name) <> 'fedex'
      LIMIT 1`
  );
  if (rows.length === 0) return;

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
