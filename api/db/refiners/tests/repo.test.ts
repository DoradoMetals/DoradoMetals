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

test("viewAll answers at least the two seeded refiners, each carrying its organization", async () => {
  await inRollback(async (c: PoolClient) => {
    const rows = await refiners.viewAll(c);
    assert.ok(rows.length >= 2, `expected at least 2 seeded refiners, got ${rows.length}`);
    for (const row of rows) {
      assert.ok(row.organization.name, "a refiner came back with no organization name");
    }
  });
});

test("viewOne answers a real refiner by id, and undefined for an id nothing seeded", async () => {
  await inRollback(async (c: PoolClient) => {
    const id = await refinerNamed(c, "Elemetal");

    const found = await refiners.viewOne(id, c);
    assert.equal(found?.id, id);
    assert.equal(found?.organization.name, "Elemetal");

    assert.equal(await refiners.viewOne(randomUUID(), c), undefined);
  });
});

test("the refiner view's timestamps are the UTC strings the contract parses", async () => {
  await inRollback(async (c: PoolClient) => {
    const view = await refiners.viewOne(await refinerId(c), c);
    assert.ok(view, "the default refiner id resolves to no row");
    assert.match(String(view.created_at), /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
  });
});
