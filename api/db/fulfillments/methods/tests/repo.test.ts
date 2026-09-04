// Writes on fulfillments.methods, against real Postgres. No create/remove - update is the only write, keyed on id.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#pool";
import { inRollback } from "#shared/testing/rollback.ts";
import { fulfillmentMethodId } from "#shared/testing/builders/index.ts";
import * as methods from "#db/fulfillments/methods/repo.ts";


beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
});

afterAll(async () => {
  await pool.end();
});

test("update writes label, leaving admin_label alone when absent", async () => {
  await inRollback(async (c: PoolClient) => {
    // fulfillments.methods IS the subject here - a reference table with no
    // create verb, so the row is named rather than built (see
    // shared/testing/builders/reference.ts). The rename rolls back.
    const id = await fulfillmentMethodId(c, "CARRIER DROPOFF", "purchase");
    const row = (await methods.getOne(id, c))!;

    const changed = await methods.update(row.id, { label: "Renamed for a test" }, c);
    assert.equal(changed, true, "update reported no row changed");

    const after = await methods.getOne(row.id, c);
    assert.equal(after?.label, "Renamed for a test");
    assert.equal(after?.admin_label, row.admin_label, "an absent field was overwritten");
  });
});

test("update answers false for an id with no method row", async () => {
  await inRollback(async (c: PoolClient) => {
    const changed = await methods.update(randomUUID(), { label: "nobody" }, c);
    assert.equal(changed, false, "update reported a change for a method that does not exist");
  });
});
