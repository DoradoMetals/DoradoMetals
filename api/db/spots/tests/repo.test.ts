// spots.spots, against real Postgres. One row per metal, seeded by
// migration - so every metal already HAS a row, and create() (repo.ts's own
// header) exists only for the metal that does not. No remove() to prove
// false-on-missing/true-on-real against - a spot is never deleted, only
// updated - so that shape is proved on update() alone, and create() is
// proved separately against a metal whose row was cleared for the test.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import pool from "#pool";
import query from "#shared/db/query.ts";
import { inRollback } from "#shared/testing/rollback.ts";
import { metalId } from "#shared/testing/builders/index.ts";
import * as spots from "#db/spots/repo.ts";

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
});

afterAll(async () => {
  await pool.end();
});

test("update writes a real metal's quote and answers true", async () => {
  await inRollback(async (c: PoolClient) => {
    const gold = await metalId(c, "Gold");

    const changed = await spots.update(gold, { bid: 2401.5, ask: 2415.25 }, c);
    assert.equal(changed, true, "update reported no row changed - Gold should already have a row");

    const rows = await spots.list(c);
    const row = rows.find((r) => r.id === gold);
    assert.equal(Number(row?.bid), 2401.5);
    assert.equal(Number(row?.ask), 2415.25);
  });
});

test("update answers false for a metal_id with no spots row", async () => {
  await inRollback(async (c: PoolClient) => {
    const changed = await spots.update(randomUUID(), { bid: 1 }, c);
    assert.equal(changed, false, "update reported a change for a metal that carries no spot");
  });
});

test("create writes the one row a metal was missing, honoring the one-per-metal constraint", async () => {
  await inRollback(async (c: PoolClient) => {
    const silver = await metalId(c, "Silver");
    // Cleared inside this rolled-back transaction, so the seed's own row is
    // untouched outside it - see repo.ts's header on when create is called.
    await query(`DELETE FROM spots.spots WHERE metal_id = $1`, [silver], c);

    await spots.create(
      silver, { ask: 30.5, bid: 30.1, dollar_change: 0.2, percent_change: 0.65 }, c
    );

    const rows = await spots.list(c);
    const created = rows.filter((r) => r.id === silver);
    assert.equal(created.length, 1);
    assert.equal(Number(created[0]?.ask), 30.5);
  });
});
