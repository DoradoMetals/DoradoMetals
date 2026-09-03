// The rates repo itself, against real Postgres.
//
// The one thing worth proving directly rather than through HTTP: `update`
// answers a BOOLEAN (D209/D212's CRUD ruling) - false for an id nobody has,
// true for one that changed.
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import * as rates from "#db/rates/repo.ts";
import * as metals from "#db/metals/repo.ts";

test("update returns false for an id nothing names", async () => {
  await inPinnedTransaction(async (client) => {
    const changed = await rates.update(randomUUID(), { unit: "oz" }, client);
    assert.equal(changed, false, "an update against a missing id reported a change");
  });
});

test("update returns true for a real id, and the row actually changed", async () => {
  await inPinnedTransaction(async (client) => {
    const [metal] = await metals.getAll(client);
    assert.ok(metal, "dev has no metal to band a rate against");

    const created = await rates.create(
      {
        metal_id: metal.id, unit: "oz", min_qty: 0, max_qty: null,
        scrap_pct: 0.9, bullion_pct: 0.95, created_by: "repo.test.ts", updated_by: "repo.test.ts",
      },
      client
    );

    const changed = await rates.update(created.id, { scrap_pct: 0.5 }, client);
    assert.equal(changed, true, "an update against a real id reported no change");

    const row = await rates.getOne(created.id, client);
    assert.equal(Number(row?.scrap_pct), 0.5);
  });
});
