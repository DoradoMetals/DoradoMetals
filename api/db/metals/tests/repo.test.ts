import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#pool";
import { inRollback } from "#shared/testing/rollback.ts";
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
    assert.ok(rows.some((m) => m.id === "Gold"), "the seeded metals do not include Gold");
  });
});

test("getOne answers a real metal and undefined for a name nothing seeded", async () => {
  await inRollback(async (c: PoolClient) => {
    assert.equal((await metals.getOne("Gold", c))?.id, "Gold");
    assert.equal(await metals.getOne("Unobtainium", c), undefined);
  });
});
