// auth.users."stripeCustomerId" - the one column payments owns on somebody
// else's row. Real Postgres, every test rolled back.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#db";
import * as customers from "#db/payments/customers/repo.ts";

let client: PoolClient;

before(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
  client = await pool.connect();
});
after(async () => { client.release(); await pool.end(); });

async function inRollback(fn: (c: PoolClient) => Promise<void>) {
  await client.query("BEGIN");
  try { await fn(client); } finally { await client.query("ROLLBACK"); }
}

test("the billing identity comes back with the provider's id for the customer", async () => {
  await inRollback(async (c: PoolClient) => {
    const { rows } = await c.query("SELECT id FROM auth.users ORDER BY id LIMIT 1");
    assert.ok(rows.length, "the test database has no auth.users row");

    const row = await customers.getOne(rows[0].id, c);
    assert.equal(row?.id, rows[0].id);
    assert.ok("stripeCustomerId" in (row ?? {}), "the provider's customer id is not projected");
  });
});

test("update sets the customer id on that user alone, and answers true", async () => {
  await inRollback(async (c: PoolClient) => {
    const { rows } = await c.query("SELECT id FROM auth.users ORDER BY id LIMIT 2");
    assert.ok(rows.length >= 2, "the test database needs two auth.users rows");
    const [target, bystander] = rows.map((r) => r.id);
    const before = (await customers.getOne(bystander, c))?.stripeCustomerId ?? null;

    const customerId = `cus_${randomUUID().slice(0, 10)}`;
    assert.equal(await customers.update(target, { [customers.STRIPE_CUSTOMER]: customerId }, c), true);

    assert.equal((await customers.getOne(target, c))?.stripeCustomerId, customerId);
    assert.equal(
      (await customers.getOne(bystander, c))?.stripeCustomerId ?? null, before,
      "another user's Stripe customer was changed"
    );
  });
});

test("update answers false for an id with no user row", async () => {
  await inRollback(async (c: PoolClient) => {
    const changed = await customers.update(
      randomUUID(), { [customers.STRIPE_CUSTOMER]: "cus_nobody" }, c
    );
    assert.equal(changed, false, "update reported a change for a user that does not exist");
  });
});
