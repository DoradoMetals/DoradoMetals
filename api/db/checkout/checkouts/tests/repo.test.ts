// checkout.checkouts, against real Postgres, every test rolled back.
//
// Device-sync, not a ledger: what is checked is that the session WORKS - one
// row per (user_id, direction), a partial write that leaves the rest alone,
// and a clear that really clears.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#db";
import { inRollback } from "#shared/testing/rollback.ts";
import { aUser } from "#shared/testing/builders/index.ts";
import * as checkouts from "#db/checkout/checkouts/repo.ts";


beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
});
afterAll(async () => { await pool.end(); });

// THE CUSTOMER IS BUILT, SO THE SESSION IS ALWAYS NEW (lane 1). This used to
// read a real person out of the frozen exchange.users table and then say "dev
// already holds sessions for its users, so a test must not assume it is
// creating one" - true, and the reason `session` had a found-or-create branch
// that no assertion here ever wanted. A built customer has no sessions at all,
// so `create` is the only path and the two directions are genuinely two new
// rows.
const session = async (c: PoolClient, user_id: string, direction: string) => {
  const created = await checkouts.create({ user_id, direction }, c);
  assert.ok(created, "the session was not created");
  return created!;
};

test("there is one session per user per direction", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = (await aUser(c)).id;
    const purchase = await session(c, user, "purchase");
    const sale = await session(c, user, "sale");
    assert.notEqual(purchase.id, sale.id, "the two directions shared a row");

    // The second create loses the race by design and answers nothing.
    assert.equal(await checkouts.create({ user_id: user, direction: "purchase" }, c), undefined);
    assert.equal((await checkouts.findFor(user, "purchase", c))?.id, purchase.id);
    assert.ok((await checkouts.listFor(user, c)).length >= 2);
  });
});

test("update writes the named columns, leaves the rest, and answers true", async () => {
  await inRollback(async (c: PoolClient) => {
    const row = await session(c, (await aUser(c)).id, "purchase");
    await checkouts.update(row.id, { package_weight: 3, declared_value: 500 }, c);

    const changed = await checkouts.update(row.id, { package_weight: 7 }, c);
    assert.equal(changed, true, "update reported no row changed");

    const after = await checkouts.getOne(row.id, c);
    assert.equal(Number(after?.package_weight), 7);
    assert.equal(Number(after?.declared_value), 500, "an absent key overwrote a column");
  });
});

test("an explicit null clears a column - the reset a placed order performs", async () => {
  await inRollback(async (c: PoolClient) => {
    const row = await session(c, (await aUser(c)).id, "purchase");
    await checkouts.update(row.id, { package_weight: 3 }, c);

    const cleared = Object.fromEntries(checkouts.PATCHABLE.map((col) => [col, null]));
    assert.equal(await checkouts.update(row.id, cleared, c), true);

    const after = await checkouts.getOne(row.id, c);
    assert.equal(after?.package_weight, null);
    assert.equal(after?.fulfillment_id, null);
    assert.equal(after?.payment_details_id, null);
  });
});

test("update answers false for an id with no session", async () => {
  await inRollback(async (c: PoolClient) => {
    assert.equal(await checkouts.update(randomUUID(), { package_weight: 1 }, c), false);
  });
});

test("remove answers true once and false the second time", async () => {
  await inRollback(async (c: PoolClient) => {
    const row = await session(c, (await aUser(c)).id, "sale");
    assert.equal(await checkouts.remove(row.id, c), true);
    assert.equal(await checkouts.remove(row.id, c), false);
  });
});
