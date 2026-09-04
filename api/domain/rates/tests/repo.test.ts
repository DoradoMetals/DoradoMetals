// The rates repo itself, against real Postgres.
// The one thing worth proving directly rather than through HTTP: `update` answers THE WRITTEN ROW - undefined for an id nobody has, the fresh row for one that changed.
import { test } from "vitest";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import * as rates from "#db/rates/repo.ts";
import * as metals from "#db/metals/repo.ts";

test("update returns undefined for an id nothing names", async () => {
  await inPinnedTransaction(async (client) => {
    const written = await rates.update(randomUUID(), { unit: "oz" }, client);
    assert.equal(written, undefined, "an update against a missing id answered a row");
  }, { actor: TEST_ACTOR.id });
});

test("update answers the written row for a real id, with the change on it", async () => {
  await inPinnedTransaction(async (client) => {
    const [metal] = await metals.list(client);
    assert.ok(metal, "dev has no metal to band a rate against");

    const created = await rates.create(
      {
        metal_id: metal.id, unit: "oz", min_qty: 0, max_qty: null,
        scrap_pct: 0.9, bullion_pct: 0.95,
      },
      client
    );

    const written = await rates.update(created.id, { scrap_pct: 0.5 }, client);
    assert.equal(Number(written?.scrap_pct), 0.5);
    assert.deepEqual(written, await rates.getOne(created.id, client));
  }, { actor: TEST_ACTOR.id });
});
