// Writes on leads.leads, against real Postgres. Self-contained: a lead has no
// foreign keys, so every row here is built and rolled back in its own
// transaction with no lock required.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import pool from "#pool";
import { inRollback } from "#shared/testing/rollback.ts";
import { aLead } from "#shared/testing/builders/index.ts";
import * as leads from "#db/leads/repo.ts";

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
});

afterAll(async () => {
  await pool.end();
});

test("update writes a real lead and answers the written row", async () => {
  await inRollback(async (c: PoolClient) => {
    const lead = await aLead(c);

    const written = await leads.update(lead.id, { name: "Renamed Lead", contacted: true }, c);
    assert.equal(written?.name, "Renamed Lead");
    assert.equal(written?.contacted, true);
    // RETURNING answers the row itself, so there is no second read to disagree.
    assert.deepEqual(written, await leads.getOne(lead.id, c));
  });
});

test("update answers undefined for an id with no lead row", async () => {
  await inRollback(async (c: PoolClient) => {
    const written = await leads.update(randomUUID(), { name: "Nobody" }, c);
    assert.equal(written, undefined, "update answered a row for a lead that does not exist");
  });
});

test("remove deletes a real lead and answers false the second time", async () => {
  await inRollback(async (c: PoolClient) => {
    const lead = await aLead(c);

    const removed = await leads.remove(lead.id, c);
    assert.equal(removed, true, "remove reported no row changed");
    assert.equal(await leads.getOne(lead.id, c), undefined);

    const removedAgain = await leads.remove(lead.id, c);
    assert.equal(removedAgain, false, "remove reported a change for a lead already gone");
  });
});
