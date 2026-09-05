import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pool from "#pool";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import * as service from "#pricing/rates/service.ts";

afterAll(async () => {
  await pool.end();
});

const pinned = <T>(fn: (c: import("pg").PoolClient) => Promise<T>) =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id });

const patch = async (c: import("pg").PoolClient) => ({
  metal_id: "Gold",
  unit: "oz",
  min_qty: 0,
  max_qty: null,
  scrap_pct: 0.9,
  bullion_pct: 0.95,
});

test("createRate writes the row and getRate reads it straight back", async () => {
  await pinned(async (c) => {
    const created = await service.createRate(await patch(c));
    assert.ok(created.id);
    assert.equal(Number(created.scrap_pct), 0.9);

    const fetched = await service.getRate(created.id);
    assert.equal(fetched.id, created.id);
    assert.equal(Number(fetched.bullion_pct), 0.95);
  });
});

test("getRate refuses an id nothing names", async () => {
  await pinned(async () => {
    await assert.rejects(() => service.getRate(randomUUID()), /no rate/);
  });
});

test("updateRate changes the row and refuses an id nothing names", async () => {
  await pinned(async (c) => {
    const created = await service.createRate(await patch(c));
    const updated = await service.updateRate(created.id, { scrap_pct: 0.5 });
    assert.equal(Number(updated.scrap_pct), 0.5);

    await assert.rejects(
      () => service.updateRate(randomUUID(), { scrap_pct: 0.1 }),
      /no rate/
    );
  });
});

test("deleteRate removes the row and reports false for an id nothing names", async () => {
  await pinned(async (c) => {
    const created = await service.createRate(await patch(c));
    const gone = await service.deleteRate(created.id);
    assert.equal(gone, true);

    const again = await service.deleteRate(randomUUID());
    assert.equal(again, false);
  });
});
