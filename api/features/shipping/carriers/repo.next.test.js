// Carrier repo tests against real Postgres.
//
// A carrier is two rows here - an organization and a shipping.carriers row - so
// most of these are about the pair staying consistent. Each test runs inside a
// transaction that is rolled back.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pool from "#db";
import * as next from "#features/shipping/carriers/repo.next.ts";
import { toLegacy, fromLegacy } from "#features/shipping/carriers/wire.ts";
import * as exchange from "#features/shipping/carriers/repo.exchange.js";

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

// The repos take the nested shape now; a request arrives flat and the adapter
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

// A carrier is a shipping.carriers row and the organization it is, and the
// response keeps them apart - separation of concerns. The flat shape the
// frontend reads is produced by the adapter, not by the repo, and both halves
// are asserted because getting either backwards breaks the frontend.
test("getAll keeps the organization as its own object", async () => {
  await inRollback(async (c) => {
    const [row] = await next.getAll(c);
    assert.deepEqual(Object.keys(row).sort(), [
      "created_at", "id", "logo", "organization", "updated_at",
    ]);
    assert.deepEqual(Object.keys(row.organization).sort(), [
      "email", "enabled", "id", "name", "phone",
    ]);
  });
});

test("the adapter flattens it to the shape the frontend reads", async () => {
  await inRollback(async (c) => {
    const [row] = await next.getAll(c);
    const legacy = toLegacy(row);
    assert.deepEqual(Object.keys(legacy).sort(), [
      "created_at", "email", "id", "is_active", "logo", "name", "phone", "updated_at",
    ]);
    assert.equal(legacy.is_active, row.organization.enabled);
    assert.equal(legacy.name, row.organization.name);
    assert.equal("organization" in legacy, false, "the nested object survived flattening");
  });
});

// Round trip: flattening and nesting again must not lose anything the frontend
// sends, because a write arrives flat and the repos take the nested shape.
test("flatten and nest round trip", async () => {
  await inRollback(async (c) => {
    const [row] = await next.getAll(c);
    const back = fromLegacy(toLegacy(row));
    assert.equal(back.organization.name, row.organization.name);
    assert.equal(back.organization.enabled, row.organization.enabled);
    assert.equal(back.id, row.id);
    assert.equal(back.logo, row.logo);
  });
});

// FEDEX_CARRIER_ID is a literal uuid in providers/fedex/constants.js and
// exchange.shipments.carrier_id references it. If the id did not survive the
// split, label creation would break.
test("the FedEx carrier keeps its original id", async () => {
  await inRollback(async (c) => {
    const fedex = await next.getById("30179428-b311-4873-8d08-382901c581d8", c);
    assert.ok(fedex, "FEDEX_CARRIER_ID must still resolve");
    assert.equal(fedex.organization.name, "FedEx");
  });
});

test("create writes both rows and reads back as one", async () => {
  await inRollback(async (c) => {
    const made = await next.create(draft(), c);
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
  await inRollback(async (c) => {
    const made = await next.create(draft(), c);
    const updated = await next.update(
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

// The carrier row holds the foreign key, so it has to go first. Removing the
// organization first would be refused, and removing only the carrier row would
// orphan the organization.
test("remove deletes both rows and leaves no orphan", async () => {
  await inRollback(async (c) => {
    const made = await next.create(draft(), c);
    const { rows: before } = await c.query(
      "SELECT organization_id FROM shipping.carriers WHERE id = $1",
      [made.id]
    );
    const orgId = before[0].organization_id;

    await next.remove(made.id, c);

    assert.equal(await next.getById(made.id, c), null);
    const { rows: orgs } = await c.query(
      "SELECT 1 FROM organizations.organizations WHERE id = $1",
      [orgId]
    );
    assert.equal(orgs.length, 0, "organization should not be orphaned");
  });
});

test("getNameById returns an empty string for an unknown id", async () => {
  await inRollback(async (c) => {
    assert.equal(await next.getNameById(randomUUID(), c), "");
  });
});

// Only CARRIER organizations are carriers. Mints, refiners and the business
// share the table, and a join that lost the shipping.carriers row would return
// all of them.
test("only carrier organizations are returned", async () => {
  await inRollback(async (c) => {
    const rows = await next.getAll(c);
    const { rows: all } = await c.query(
      "SELECT count(*)::int AS n FROM organizations.organizations"
    );
    assert.ok(rows.length < all[0].n);
  });
});

// Everything except the organization's own id, which exchange has no equivalent
// for: an organization is a new concept and the migration issued its id. The
// carrier's id is compared and matters more - FEDEX_CARRIER_ID is a literal
// uuid that exchange.shipments.carrier_id references.
const withoutOrgId = (rows) =>
  rows.map(({ organization, ...rest }) => ({
    ...rest,
    organization: { ...organization, id: undefined },
  }));

test("both implementations agree", async () => {
  await inRollback(async (c) => {
    assert.deepEqual(withoutOrgId(await next.getAll(c)), withoutOrgId(await exchange.getAll(c)));
  });
});

test("a write made with a client is invisible on the pool", async () => {
  await client.query("BEGIN");
  const made = await next.create(draft(), client);
  const outside = await next.getById(made.id);
  await client.query("ROLLBACK");

  assert.ok(made.id);
  assert.equal(outside, null);
});
