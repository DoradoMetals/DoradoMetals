// Carriers through the service, against real Postgres.
//
// A carrier is two rows in the new schema - an organization and a
// shipping.carriers row - plus one flat row in exchange, and all three are
// written together. Most of these are about that trio staying consistent.
//
// This replaces repo.next.test.js, which compared the two implementations
// against each other. There is only one implementation now: reads come from the
// new schema and exchange is written alongside it, so the comparison that used
// to be "do both reads agree" is now "did the write reach exchange too".
//
// Each test runs inside a transaction that is rolled back.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pool from "#db";
import * as service from "#features/shipping/carriers/service.ts";

let client;

before(async () => {
  client = await pool.connect();
});

after(async () => {
  client.release();
  await pool.end();
});

async function inRollback(fn) {
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
  await inRollback(async (c) => {
    const made = await service.createCarrier(draft(), c);
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

// THE DUAL WRITE. exchange.carriers is still the record of truth until carriers
// is promoted, and it keeps both halves on one row - so the organization's
// fields have to land there too, under exchange's own names.
test("create writes the same carrier into exchange, under the same id", async () => {
  await inRollback(async (c) => {
    const input = draft();
    const made = await service.createCarrier(input, c);

    const { rows } = await c.query(
      `SELECT id, name, email, phone, logo, is_active FROM exchange.carriers WHERE id = $1`,
      [made.id]
    );
    assert.equal(rows.length, 1, "the carrier never reached exchange");
    assert.equal(rows[0].name, input.organization.name);
    assert.equal(rows[0].email, input.organization.email);
    assert.equal(rows[0].phone, input.organization.phone);
    assert.equal(rows[0].logo, input.logo);
    assert.equal(rows[0].is_active, input.organization.enabled,
      "enabled did not land on exchange's is_active");
  });
});

test("update changes both the organization and the carrier row", async () => {
  await inRollback(async (c) => {
    const made = await service.createCarrier(draft(), c);
    const updated = await service.updateCarrier(
      {
        ...made,
        organization: { ...made.organization, name: "renamed", enabled: false },
        logo: "/carriers/new.png",
      },
      c
    );
    assert.equal(updated.organization.name, "renamed");
    assert.equal(updated.organization.enabled, false);
    assert.equal(updated.logo, "/carriers/new.png");
    assert.equal(updated.id, made.id);
  });
});

test("update carries the change into exchange as well", async () => {
  await inRollback(async (c) => {
    const made = await service.createCarrier(draft(), c);
    await service.updateCarrier(
      { ...made, organization: { ...made.organization, name: "renamed", enabled: false } },
      c
    );

    const { rows } = await c.query(
      `SELECT name, is_active FROM exchange.carriers WHERE id = $1`, [made.id]
    );
    assert.equal(rows[0].name, "renamed", "exchange still holds the old name");
    assert.equal(rows[0].is_active, false);
  });
});

// The carrier row holds the foreign key, so it has to go first. Removing the
// organization first would be refused, and removing only the carrier row would
// orphan the organization.
test("remove deletes both rows and leaves no orphan", async () => {
  await inRollback(async (c) => {
    const made = await service.createCarrier(draft(), c);
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
  const outside = await service.getCarrierById(made.id);
  await client.query("ROLLBACK");

  assert.ok(made.id);
  assert.equal(outside, null);
});

// updateCarrier with no id used to be `WHERE id = NULL`, which matched nothing
// and returned null. It still returns null rather than throwing, and - the part
// worth pinning - it must not have written anything on the way there.
test("an update with no id changes nothing", async () => {
  await inRollback(async (c) => {
    const { rows: before } = await c.query("SELECT count(*)::int n FROM exchange.carriers");
    assert.equal(await service.updateCarrier({ organization: { name: "nobody" } }, c), null);
    const { rows: after } = await c.query("SELECT count(*)::int n FROM exchange.carriers");
    assert.equal(after[0].n, before[0].n);
  });
});
