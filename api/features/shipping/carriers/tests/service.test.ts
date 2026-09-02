// Carriers through the service, against real Postgres.
//
// A carrier is two rows in the new schema - an organization and a
// shipping.carriers row - and both are
// written together. Most of these are about that trio staying consistent.
//
// This replaces repo.next.test.js, which compared the two implementations
// against each other. There is only one implementation now: reads come from the
// organization and the carrier row, and the reads compose the two back.
//
// Each test runs inside a transaction that is rolled back.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#db";
import * as service from "#features/shipping/carriers/service.ts";

let client: PoolClient;

before(async () => {
  client = await pool.connect();
});

after(async () => {
  client.release();
  await pool.end();
});

async function inRollback(fn: (c: PoolClient) => Promise<void>) {
  await client.query("BEGIN");
  try {
    await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

// The service takes the nested shape; a request arrives flat and the adapter
// nests it at the edge.
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

// The flatten/round-trip tests lived here until the conversion
// (2026-08-27): carriers' lift adapter was deleted when the frontend switched
// to the nested contracts shape, so there is no flattening left to prove.
// replay.test.js asserts the nested shape over HTTP.

// FEDEX_CARRIER_ID is a literal uuid in providers/shipments/constants.ts and
// exchange.shipments.carrier_id references it. If the id did not survive the
// split, label creation would break.
test("the FedEx carrier keeps its original id", async () => {
  const fedex = await service.getCarrierById("30179428-b311-4873-8d08-382901c581d8");
  assert.ok(fedex, "FEDEX_CARRIER_ID must still resolve");
  assert.equal(fedex.organization.name, "FedEx");
});

// The list is sorted by the organization's name, which is not a column of
// shipping.carriers - `ORDER BY o.name ASC, c.id ASC` was on the joined column
// and moved into compose.ts. A sort that quietly stopped happening is the kind
// of thing nothing else would notice.
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

// The carrier row holds the foreign key, so it has to go first. Removing the
// organization first would be refused, and removing only the carrier row would
// orphan the organization.
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

// Only CARRIER organizations are carriers. Mints, refiners and the business
// share the table, and a compose step that lost the shipping.carriers row would
// return all of them.
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

// updateCarrier with no id used to be `WHERE id = NULL`, which matched nothing
// and returned null. It still returns null rather than throwing, and - the part
// worth pinning - it must not have written anything on the way there.
test("an update with no id changes nothing", async () => {
  await inRollback(async (c: PoolClient) => {
    const { rows: before } = await c.query("SELECT count(*)::int n FROM exchange.carriers");
    assert.equal(await service.updateCarrier({ organization: { name: "nobody" } }, c), null);
    const { rows: after } = await c.query("SELECT count(*)::int n FROM exchange.carriers");
    assert.equal(after[0].n, before[0].n);
  });
});
