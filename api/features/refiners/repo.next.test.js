// Refiner repo tests against real Postgres.
//
// Refiners are read-only through the API, so these are about the shape the
// join produces rather than write behaviour. Each test runs inside a
// transaction that is rolled back.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pool from "#db";
import * as next from "#features/refiners/repo.next.ts";
import { toLegacy } from "#features/refiners/wire.ts";
import * as exchange from "#features/refiners/repo.exchange.js";

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

// A supplier is a refiner and the organization it is, kept apart - the flat
// shape the frontend reads is produced by the adapter, not the repo.
test("getAllRefiners keeps the organization as its own object", async () => {
  await inRollback(async (c) => {
    const [row] = await next.getAllRefiners(c);
    assert.deepEqual(Object.keys(row).sort(), [
      "created_at", "id", "logo", "organization", "updated_at",
    ]);
  });
});

// `enabled` is the organization's column name and stays that way in the repo.
// The frontend reads `is_active`, and features/refiners/wire.ts is what turns
// one into the other - so both halves are asserted.
test("the adapter flattens it to the shape the frontend reads", async () => {
  await inRollback(async (c) => {
    const rows = await next.getAllRefiners(c);
    assert.ok(rows.every((r) => typeof r.organization.enabled === "boolean"));

    const legacy = toLegacy(rows);
    assert.ok(legacy.every((r) => typeof r.is_active === "boolean"));
    assert.equal(legacy.some((r) => r.is_active === false), true);
    assert.equal("organization" in legacy[0], false, "the nested object survived flattening");
    assert.equal(legacy[0].name, rows[0].organization.name);
  });
});

// The refiners row carries the original supplier id, which is what
// products.supplier_id references. If that ever stopped being true, every
// product would lose its supplier.
test("the id is the original supplier id, not the organization id", async () => {
  await inRollback(async (c) => {
    for (const s of await next.getAllRefiners(c)) {
      const { rows } = await c.query(
        "SELECT organization_id FROM refiners.refiners WHERE id = $1",
        [s.id]
      );
      assert.equal(rows.length, 1, "id should be a refiners id");
      assert.notEqual(rows[0].organization_id, s.id, "and not the org id");
    }
  });
});

test("getRefinerFromId reads back the same row getAllRefiners returns", async () => {
  await inRollback(async (c) => {
    const [first] = await next.getAllRefiners(c);
    assert.deepEqual(await next.getRefinerFromId(first.id, c), first);
  });
});

test("getRefinerFromId returns undefined for an unknown id", async () => {
  await inRollback(async (c) => {
    assert.equal(await next.getRefinerFromId(randomUUID(), c), undefined);
  });
});

// Only REFINER organizations are refiners. Mints and carriers live in the same
// table, and a join that forgot the refiners row would return all of them.
test("only refiner organizations are returned", async () => {
  await inRollback(async (c) => {
    const rows = await next.getAllRefiners(c);
    const { rows: totals } = await c.query(
      "SELECT count(*)::int AS n FROM organizations.organizations"
    );
    assert.ok(rows.length < totals[0].n, "must not return every organization");

    for (const s of rows) {
      const { rows: org } = await c.query(
        `SELECT o.type FROM refiners.refiners r
         JOIN organizations.organizations o ON o.id = r.organization_id
         WHERE r.id = $1`,
        [s.id]
      );
      assert.equal(org[0].type, "REFINER");
    }
  });
});

// Everything except the organization's own id, which exchange has no equivalent
// for - the migration issued it. The supplier's id is compared and is what
// products.supplier_id references.
const withoutOrgId = (rows) =>
  rows.map(({ organization, ...rest }) => ({
    ...rest,
    organization: { ...organization, id: undefined },
  }));

test("both implementations agree", async () => {
  await inRollback(async (c) => {
    assert.deepEqual(
      withoutOrgId(await next.getAllRefiners(c)),
      withoutOrgId(await exchange.getAllRefiners(c))
    );
  });
});
