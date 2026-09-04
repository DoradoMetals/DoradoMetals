// products.mints, against real Postgres. READ ONLY - repo.ts's own header:
// mints are reference data (the admin product form picks one), nothing writes
// them at runtime. Same shape as metals' repo test: a real seeded id
// resolves, an id nothing seeded does not.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import pool from "#pool";
import { inRollback } from "#shared/testing/rollback.ts";
import { mintId } from "#shared/testing/builders/index.ts";
import * as mints from "#db/mints/repo.ts";

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
});

afterAll(async () => {
  await pool.end();
});

test("list answers at least one seeded mint", async () => {
  await inRollback(async (c: PoolClient) => {
    const rows = await mints.list(c);
    assert.ok(rows.length > 0, "the mints seed is empty - migration 047 provides it");
  });
});

test("getOne answers a real mint and undefined for an id nothing seeded", async () => {
  await inRollback(async (c: PoolClient) => {
    const id = await mintId(c);

    const found = await mints.getOne(id, c);
    assert.equal(found?.id, id);

    assert.equal(await mints.getOne(randomUUID(), c), undefined);
  });
});
