import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import pool from "#pool";
import { inRollback } from "#shared/testing/rollback.ts";
import { metalId } from "#shared/testing/builders/index.ts";
import * as metals from "#db/metals/repo.ts";

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
});

afterAll(async () => {
  await pool.end();
});

test("list answers the four seeded metals, Gold among them", async () => {
  await inRollback(async (c: PoolClient) => {
    const rows = await metals.list(c);
    assert.ok(rows.length >= 4, `expected at least 4 seeded metals, got ${rows.length}`);
    assert.ok(rows.some((m) => m.name === "Gold"), "the seeded metals do not include Gold");
  });
});

test("getOne answers a real metal and undefined for an id nothing seeded", async () => {
  await inRollback(async (c: PoolClient) => {
    const gold = await metalId(c, "Gold");

    const found = await metals.getOne(gold, c);
    assert.equal(found?.name, "Gold");

    assert.equal(await metals.getOne(randomUUID(), c), undefined);
  });
});

test("namesById and idsByName agree with each other in both directions", async () => {
  await inRollback(async (c: PoolClient) => {
    const gold = await metalId(c, "Gold");

    const names = await metals.namesById(c);
    assert.equal(names.get(gold), "Gold");

    const ids = await metals.idsByName(c);
    assert.equal(ids.get("Gold"), gold);
    assert.equal(ids.get("a metal that does not exist"), undefined);
  });
});
