// Writes on leads.leads, against real Postgres. Self-contained: a lead has no
// foreign keys, so every row here is built and rolled back in its own
// transaction with no lock required.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import pool from "#db";
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

test("update writes a real lead and answers true", async () => {
  await inRollback(async (c: PoolClient) => {
    const lead = await aLead(c);

    const changed = await leads.update(lead.id, { name: "Renamed Lead", contacted: true }, c);
    assert.equal(changed, true, "update reported no row changed");

    const after = await leads.getOne(lead.id, c);
    assert.equal(after?.name, "Renamed Lead");
    assert.equal(after?.contacted, true);
  });
});

test("update answers false for an id with no lead row", async () => {
  await inRollback(async (c: PoolClient) => {
    const changed = await leads.update(randomUUID(), { name: "Nobody" }, c);
    assert.equal(changed, false, "update reported a change for a lead that does not exist");
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
