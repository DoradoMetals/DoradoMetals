import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import pool from "#pool";
import { inRollback } from "#shared/testing/rollback.ts";
import { refinerId, refinerNamed } from "#shared/testing/builders/index.ts";
import * as refiners from "#db/refiners/repo.ts";

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
});

afterAll(async () => {
  await pool.end();
});

test("list answers at least the two seeded refiners", async () => {
  await inRollback(async (c: PoolClient) => {
    const rows = await refiners.list(c);
    assert.ok(rows.length >= 2, `expected at least 2 seeded refiners, got ${rows.length}`);
  });
});

test("getOne answers a real refiner by id, and undefined for an id nothing seeded", async () => {
  await inRollback(async (c: PoolClient) => {
    const id = await refinerNamed(c, "Elemetal");

    const found = await refiners.getOne(id, c);
    assert.equal(found?.id, id);
    assert.ok(found?.organization_id, "the refiner carries no organization_id");

    assert.equal(await refiners.getOne(randomUUID(), c), undefined);
  });
});

test("the default refiner reference resolves to a real row", async () => {
  await inRollback(async (c: PoolClient) => {
    const id = await refinerId(c);
    assert.ok(await refiners.getOne(id, c), "the default refiner id resolves to no row");
  });
});
