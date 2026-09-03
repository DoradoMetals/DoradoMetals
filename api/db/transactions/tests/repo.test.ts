// payments.ledger, against real Postgres. A ledger has no update/remove -
// entries are append-only facts, never edited or deleted (create, byUser and
// hasCreditFor are the whole surface). The false-on-missing/true-on-real
// shape this table offers instead is hasCreditFor: true once a real Credit
// entry is logged against an order, false for an order with none - the exact
// guard the abandonment refund reads so a refund can't happen twice.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import pool from "#db";
import { LOCKS } from "#shared/testing/locks.ts";
import { rollbackIn } from "#shared/testing/rollback.ts";
import { aUser, anOrder } from "#shared/testing/builders/index.ts";
import * as ledger from "#db/transactions/repo.ts";

// A ledger entry can name an order, which is orders.* - the same lock every
// order-money fixture takes.
const inRollback = rollbackIn({ lock: LOCKS.ORDERS });

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
});

afterAll(async () => {
  await pool.end();
});

test("create writes a real ledger entry, and byUser answers it", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);

    const row = await ledger.create(randomUUID(), user.id, "Credit", null, 42.5, c);
    assert.equal(row.user_id, user.id);
    assert.equal(row.type, "Credit");
    assert.equal(Number(row.amount), 42.5);

    const rows = await ledger.byUser(user.id, c);
    assert.ok(rows.some((r) => r.id === row.id), "byUser did not answer the entry just written");
  });
});

test("hasCreditFor is true once a Credit is logged against the order, and false before", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const order = await anOrder(c, user, { direction: "purchase" });

    assert.equal(
      await ledger.hasCreditFor(order.id, c), false,
      "hasCreditFor reported a credit before one was ever logged"
    );

    await ledger.create(randomUUID(), user.id, "Credit", order.id, 15, c);

    assert.equal(await ledger.hasCreditFor(order.id, c), true);
  });
});

test("hasCreditFor ignores a non-Credit entry against the same order", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const order = await anOrder(c, user, { direction: "purchase" });

    await ledger.create(randomUUID(), user.id, "Debit", order.id, 15, c);

    assert.equal(
      await ledger.hasCreditFor(order.id, c), false,
      "a Debit entry was read as a Credit"
    );
  });
});
