// Carriers through the service, against real Postgres - a carrier is two rows (organization + shipping.carriers), written together; most of these check that they stay consistent.
// Each test runs inside a transaction that is rolled back.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#db";
import { inRollback } from "#shared/testing/rollback.ts";
import * as service from "#domain/shipping/carriers/service.ts";

let client: PoolClient;

beforeAll(async () => {
  client = await pool.connect();
});

afterAll(async () => {
  client.release();
  await pool.end();
});

// The shape the controller passes through untouched - createCarrier takes it nested.
const draft = (over = {}) => ({
  logo: "/carriers/probe.png",
  organization: {
    name: `probe-${randomUUID().slice(0, 8)}`,
    email: "probe@example.test",
    phone: "5550000",
    enabled: true,
  },
  ...over,
});

test("getAllCarriers keeps the organization as its own object", async () => {
  const [row] = await service.getAllCarriers();
  assert.deepEqual(Object.keys(row).sort(), [
    "created_at", "id", "logo", "organization", "updated_at",
  ]);
  assert.deepEqual(Object.keys(row.organization).sort(), [
    "email", "enabled", "id", "name", "phone",
  ]);
});

// No flatten/round-trip tests here - there's no adapter any more; replay.test.ts asserts the nested shape over HTTP.

// FEDEX_CARRIER_ID (providers/shipments/constants.ts) is a literal uuid. If it did not survive as a real carrier's id, label creation would break.
test("the FedEx carrier keeps its original id", async () => {
  const fedex = await service.getCarrierById("30179428-b311-4873-8d08-382901c581d8");
  assert.ok(fedex, "FEDEX_CARRIER_ID must still resolve");
  assert.equal(fedex.organization.name, "FedEx");
});

// Sorted by the organization's name (not a column of shipping.carriers) - moved into compose.ts; a silently dropped sort is the kind of bug nothing else would notice.
test("the list is ordered by the organization's name", async () => {
  const names = (await service.getAllCarriers()).map((c) => c.organization.name ?? "");
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
});

test("create writes both new rows and reads back as one", async () => {
  await inRollback(async (c: PoolClient) => {
    const made = await service.createCarrier(draft(), c);
    assert.ok(made, "the service returned nothing");
    assert.ok(made.id);
    assert.equal(made.logo, "/carriers/probe.png");

    const { rows } = await c.query(
      `SELECT o.type FROM shipping.carriers sc
       JOIN organizations.organizations o ON o.id = sc.organization_id
       WHERE sc.id = $1`,
      [made.id]
    );
    assert.equal(rows[0].type, "CARRIER");
  });
});

test("update changes both the organization and the carrier row", async () => {
  await inRollback(async (c: PoolClient) => {
    const made = await service.createCarrier(draft(), c);
    assert.ok(made, "the service returned nothing");
    const updated = await service.updateCarrier(
      {
        ...made,
        organization: { ...made.organization, name: "renamed", enabled: false },
        logo: "/carriers/new.png",
      },
      c
    );
    assert.ok(updated, "the update returned nothing");
    assert.equal(updated.organization.name, "renamed");
    assert.equal(updated.organization.enabled, false);
    assert.equal(updated.logo, "/carriers/new.png");
    assert.equal(updated.id, made.id);
  });
});

// The carrier row holds the foreign key, so it goes first - the reverse order would refuse, or removing only the carrier would orphan the organization.
test("remove deletes both rows and leaves no orphan", async () => {
  await inRollback(async (c: PoolClient) => {
    const made = await service.createCarrier(draft(), c);
    assert.ok(made, "the service returned nothing");
    const { rows: before } = await c.query(
      "SELECT organization_id FROM shipping.carriers WHERE id = $1",
      [made.id]
    );
    const orgId = before[0].organization_id;

    await service.removeCarrier(made.id, c);

    assert.equal(await service.getCarrierById(made.id, c), null);
    const { rows: orgs } = await c.query(
      "SELECT 1 FROM organizations.organizations WHERE id = $1",
      [orgId]
    );
    assert.equal(orgs.length, 0, "organization should not be orphaned");
    const { rows: ex } = await c.query(
      "SELECT 1 FROM exchange.carriers WHERE id = $1", [made.id]
    );
    assert.equal(ex.length, 0, "the carrier is still in exchange after a delete");
  });
});

test("getCarrierName returns an empty string for an unknown id", async () => {
  assert.equal(await service.getCarrierName(randomUUID()), "");
});

// Only CARRIER organizations are carriers - mints, refiners and the business share the table, and a broken compose step would return all of them.
test("only carrier organizations are returned", async () => {
  const rows = await service.getAllCarriers();
  const { rows: all } = await client.query(
    "SELECT count(*)::int AS n FROM organizations.organizations"
  );
  assert.ok(rows.length < all[0].n);
});

test("a write made with a client is invisible on the pool", async () => {
  await client.query("BEGIN");
  const made = await service.createCarrier(draft(), client);
  assert.ok(made, "the service returned nothing");
  const outside = await service.getCarrierById(made.id);
  await client.query("ROLLBACK");

  assert.ok(made.id);
  assert.equal(outside, null);
});

// No id must return null AND write nothing - not just fail to throw.
test("an update with no id changes nothing", async () => {
  await inRollback(async (c: PoolClient) => {
    const { rows: before } = await c.query("SELECT count(*)::int n FROM exchange.carriers");
    assert.equal(await service.updateCarrier({ organization: { name: "nobody" } }, c), null);
    const { rows: after } = await c.query("SELECT count(*)::int n FROM exchange.carriers");
    assert.equal(after[0].n, before[0].n);
  });
});
