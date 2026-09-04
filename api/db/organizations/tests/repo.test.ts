import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#pool";
import { inRollback } from "#shared/testing/rollback.ts";
import * as repo from "#db/organizations/repo.ts";

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
});

afterAll(async () => {
  await pool.end();
});

const NOBODY = "00000000-0000-0000-0000-000000000000";

test("update returns false on a missing id", async () => {
  await inRollback(async (c) => {
    const ok = await repo.update(NOBODY, { name: "nobody" }, c);
    assert.equal(ok, false);
  });
});

test("update returns true on a real id, and changes exactly that row", async () => {
  await inRollback(async (c) => {
    const created = await repo.create(
      { name: "Before", enabled: true }, randomUUID(), "CARRIER", c
    );
    const ok = await repo.update(created.id, { name: "After", enabled: false }, c);
    assert.equal(ok, true);

    const row = await repo.getOne(created.id, c);
    assert.equal(row?.name, "After");
    assert.equal(row?.enabled, false);
  });
});

test("create then remove: remove reports true once and false the second time", async () => {
  await inRollback(async (c) => {
    const created = await repo.create({ name: "Temp", enabled: true }, randomUUID(), "CARRIER", c);
    assert.equal(await repo.remove(created.id, c), true);
    assert.equal(await repo.remove(created.id, c), false);
    assert.equal(await repo.getOne(created.id, c), undefined);
  });
});

test("list includes a freshly created row", async () => {
  await inRollback(async (c) => {
    const created = await repo.create({ name: "Listed", enabled: true }, randomUUID(), "CARRIER", c);
    const rows = await repo.list(c);
    assert.ok(rows.some((r) => r.id === created.id));
  });
});
