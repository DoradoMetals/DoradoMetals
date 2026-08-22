// Supplier repo tests against real Postgres.
//
// Suppliers are read-only through the API, so these are about the shape the
// join produces rather than write behaviour. Each test runs inside a
// transaction that is rolled back.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pool from "#db";
import * as next from "#features/suppliers/repo.next.js";
import * as exchange from "#features/suppliers/repo.exchange.js";

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

test("getAllSuppliers returns the exchange wire shape", async () => {
  await inRollback(async (c) => {
    const [row] = await next.getAllSuppliers(c);
    assert.deepEqual(Object.keys(row).sort(), [
      "created_at", "email", "id", "is_active", "logo", "name", "phone", "updated_at",
    ]);
  });
});

// enabled is the organization's column name; the repo aliases it so nothing
// above has to know a supplier is now two rows.
test("enabled is exposed as is_active", async () => {
  await inRollback(async (c) => {
    const rows = await next.getAllSuppliers(c);
    assert.ok(rows.every((r) => typeof r.is_active === "boolean"));
    assert.equal(rows.some((r) => r.is_active === false), true);
  });
});

// The refiners row carries the original supplier id, which is what
// products.supplier_id references. If that ever stopped being true, every
// product would lose its supplier.
test("the id is the original supplier id, not the organization id", async () => {
  await inRollback(async (c) => {
    for (const s of await next.getAllSuppliers(c)) {
      const { rows } = await c.query(
        "SELECT organization_id FROM refiners.refiners WHERE id = $1",
        [s.id]
      );
      assert.equal(rows.length, 1, "id should be a refiners id");
      assert.notEqual(rows[0].organization_id, s.id, "and not the org id");
    }
  });
});

test("getSupplierFromId reads back the same row getAllSuppliers returns", async () => {
  await inRollback(async (c) => {
    const [first] = await next.getAllSuppliers(c);
    assert.deepEqual(await next.getSupplierFromId(first.id, c), first);
  });
});

test("getSupplierFromId returns undefined for an unknown id", async () => {
  await inRollback(async (c) => {
    assert.equal(await next.getSupplierFromId(randomUUID(), c), undefined);
  });
});

// Only REFINER organizations are suppliers. Mints and carriers live in the same
// table, and a join that forgot the refiners row would return all of them.
test("only refiner organizations are returned", async () => {
  await inRollback(async (c) => {
    const rows = await next.getAllSuppliers(c);
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

test("both implementations agree", async () => {
  await inRollback(async (c) => {
    assert.deepEqual(
      await next.getAllSuppliers(c),
      await exchange.getAllSuppliers(c)
    );
  });
});
