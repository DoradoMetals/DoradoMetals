// shipping.packages, against real Postgres. READ ONLY - repo.ts's own
// header: reference data, no create/update/remove. What this proves: a real
// seeded package resolves by id and by (carrier, label), an id nothing seeded
// does not, and the offered/labelsById reads agree with the seed.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import pool from "#pool";
import { inRollback } from "#shared/testing/rollback.ts";
import { packageId, carrierId } from "#shared/testing/builders/index.ts";
import * as packages from "#db/shipping/packages/repo.ts";

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
});

afterAll(async () => {
  await pool.end();
});

test("getAll answers at least the seeded Small Box", async () => {
  await inRollback(async (c: PoolClient) => {
    const rows = await packages.getAll(c);
    assert.ok(rows.some((p) => p.label === "Small Box"), "the seed no longer offers Small Box");
  });
});

test("getOne answers a real package and undefined for an id nothing seeded", async () => {
  await inRollback(async (c: PoolClient) => {
    const id = await packageId(c, "Small Box");

    const found = await packages.getOne(id, c);
    assert.equal(found?.label, "Small Box");

    assert.equal(await packages.getOne(randomUUID(), c), undefined);
  });
});

test("find resolves the (carrier, label) pair, and a pair nothing seeded resolves to nothing", async () => {
  await inRollback(async (c: PoolClient) => {
    const carrier_id = await carrierId(c, "FedEx");

    const found = await packages.find(carrier_id, "no such label", c);
    assert.equal(found, undefined);
  });
});

test("labelsById maps every seeded package's id to its label", async () => {
  await inRollback(async (c: PoolClient) => {
    const id = await packageId(c, "Small Box");
    const labels = await packages.labelsById(c);
    assert.equal(labels.get(id), "Small Box");
  });
});

test("getOffered answers the checkout's box menu", async () => {
  await inRollback(async (c: PoolClient) => {
    const rows = await packages.getOffered(c);
    assert.ok(rows.length > 0, "no packages are offered at checkout");
    assert.ok(rows.some((p) => p.label === "Small Box"));
  });
});
