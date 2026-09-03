// Writes on shipping.carriers, against real Postgres. Self-contained: every row is created and rolled back in the same transaction, so no shared/testing/locks.ts lock applies.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#db";
import * as carriers from "#db/shipping/carriers/repo.ts";

let client: PoolClient;

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
  client = await pool.connect();
});

afterAll(async () => {
  client.release();
  await pool.end();
});

async function inRollback(fn: (c: PoolClient) => Promise<void>) {
  await client.query("BEGIN");
  try {
    await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

async function anOrganization(c: PoolClient): Promise<string> {
  const id = randomUUID();
  await c.query(
    `INSERT INTO organizations.organizations (id, type, name, enabled) VALUES ($1, 'CARRIER', 'Test Carrier Co', true)`,
    [id]
  );
  return id;
}

test("update writes logo on a real carrier", async () => {
  await inRollback(async (c: PoolClient) => {
    const organization_id = await anOrganization(c);
    const row = await carriers.create({ id: randomUUID(), organization_id, logo: null }, c);

    const changed = await carriers.update(row.id, { logo: "https://example.com/logo.png" }, c);
    assert.equal(changed, true, "update reported no row changed");

    const after = await carriers.getOne(row.id, c);
    assert.equal(after?.logo, "https://example.com/logo.png");
  });
});

test("update answers false for an id with no carrier row", async () => {
  await inRollback(async (c: PoolClient) => {
    const changed = await carriers.update(randomUUID(), { logo: "x" }, c);
    assert.equal(changed, false, "update reported a change for a carrier that does not exist");
  });
});

test("remove deletes a real carrier and answers false the second time", async () => {
  await inRollback(async (c: PoolClient) => {
    const organization_id = await anOrganization(c);
    const row = await carriers.create({ id: randomUUID(), organization_id, logo: null }, c);

    const removed = await carriers.remove(row.id, c);
    assert.equal(removed, true, "remove reported no row changed");
    assert.equal(await carriers.getOne(row.id, c), undefined);

    const removedAgain = await carriers.remove(row.id, c);
    assert.equal(removedAgain, false, "remove reported a change for a carrier already gone");
  });
});
