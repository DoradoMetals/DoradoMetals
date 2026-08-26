// Mint repo tests against real Postgres.
//
// A mint is now two rows, so most of what can go wrong here is the join:
// picking up the wrong organization, losing a mint that has none, or letting
// the timestamp type change shift a value. Each test runs inside a transaction
// that is rolled back.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pool from "#db";
import * as next from "#features/mints/repo.next.ts";
import * as exchange from "#features/mints/repo.exchange.js";

let client;

before(async () => {
  // exchange stores these timestamps naive, so node-postgres parses them in the
  // process timezone, while products.mints stores timestamptz and parses to the
  // same instant regardless. Under any timezone but UTC the two disagree by the
  // local offset - which is the point of pinning TZ in both Dockerfiles, and is
  // worth failing on explicitly rather than as an unexplained five-hour diff.
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

async function inRollback(fn) {
  await client.query("BEGIN");
  try {
    await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

test("getAllMints returns the exchange wire shape", async () => {
  await inRollback(async (c) => {
    const [row] = await next.getAllMints(c);
    assert.deepEqual(Object.keys(row).sort(), [
      "country", "created_at", "description", "id", "name", "type",
      "updated_at", "website",
    ]);
  });
});

test("every mint matches its exchange row field for field", async () => {
  await inRollback(async (c) => {
    assert.deepEqual(await next.getAllMints(c), await exchange.getAllMints(c));
  });
});

// description comes from the organization, not the mint. If the join picked up
// the wrong one this is the test that notices, because only one mint has a
// description at all and it would land on whichever row the join matched.
test("the description comes from the mint's own organization", async () => {
  await inRollback(async (c) => {
    const described = (await next.getAllMints(c)).filter((m) => m.description);
    assert.equal(described.length, 1);
    assert.equal(described[0].name, "Varies");
    const { rows: [org] } = await c.query(
      `SELECT o.name FROM products.mints m
       JOIN organizations.organizations o ON o.id = m.organization_id
       WHERE m.id = $1`,
      [described[0].id]
    );
    assert.equal(org.name, "Varies");
  });
});

// timestamptz in, naive UTC out. Both sides agree only because the process runs
// in UTC, which the Dockerfiles pin - so assert against a value with a known
// offset rather than trusting the ambient timezone.
test("timestamps survive the timestamptz conversion", async () => {
  await inRollback(async (c) => {
    const [m] = await next.getAllMints(c);
    await c.query("UPDATE products.mints SET updated_at = $1 WHERE id = $2",
      ["2026-03-04T05:06:07.123456Z", m.id]);
    const after = (await next.getAllMints(c)).find((r) => r.id === m.id);
    assert.equal(after.updated_at.toISOString(), "2026-03-04T05:06:07.123Z");
  });
});

// Restored by migration 026. The API resolves mint_id by name when saving a
// product, so two mints sharing a name would break that lookup at write time.
test("mint names are unique", async () => {
  await inRollback(async (c) => {
    const [m] = await next.getAllMints(c);
    await assert.rejects(
      () => c.query(
        `INSERT INTO products.mints (id, name, type, organization_id)
         SELECT $1, name, type, organization_id FROM products.mints WHERE id = $2`,
        [randomUUID(), m.id]
      ),
      /mints_name_key|duplicate key/
    );
  });
});

// Also restored by 026.
test("an unknown mint type is rejected", async () => {
  await inRollback(async (c) => {
    await assert.rejects(
      () => c.query("UPDATE products.mints SET type = 'Municipal' WHERE id = (SELECT id FROM products.mints LIMIT 1)"),
      /mints_type_check/
    );
  });
});

// The join is inner, so a mint whose organization vanished disappears from the
// read rather than arriving with null columns. That is deliberate, but it means
// the FK is what keeps the two counts equal - this pins that they are.
test("no mint is lost to the organization join", async () => {
  await inRollback(async (c) => {
    const { rows: [{ n }] } = await c.query("SELECT count(*)::int n FROM products.mints");
    assert.equal((await next.getAllMints(c)).length, n);
  });
});

test("mints come back ordered by name", async () => {
  await inRollback(async (c) => {
    const names = (await next.getAllMints(c)).map((m) => m.name);
    assert.deepEqual(names, [...names].sort());
  });
});
