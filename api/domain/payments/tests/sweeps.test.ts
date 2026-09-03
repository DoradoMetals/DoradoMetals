// The create-then-charge safety net, exercised for real: seeded orders and
// intents (payments.intents/attempts - the native record since D212), both
// sweeps, inside the pinned transaction so nothing survives.
import test from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import query from "#shared/db/query.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { sweepSettledIntents, sweepAbandoned } from "#domain/payments/sweeps.ts";

async function seedSale(
  c: PoolClient,
  over: { status?: string; user_id?: string | null; ageHours?: number } = {}
): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO orders.orders (direction, status, number, user_id, created_at)
     VALUES ('sale', $1, nextval('orders.sale_number_seq'), $2,
             now() - make_interval(hours => $3))
     RETURNING id`,
    [over.status ?? "Pending", over.user_id ?? null, over.ageHours ?? 0], c
  );
  return rows[0]!.id;
}

async function seedIntent(
  c: PoolClient, provider_ref: string, status: string, order_id: string
): Promise<void> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO payments.intents (type, status, amount_expected, order_id)
     VALUES ('order', $1, 51.78, $2) RETURNING id`,
    [status, order_id], c
  );
  await query(
    `INSERT INTO payments.attempts (id, intent_id, provider, provider_ref, amount, status)
     VALUES ($1, $1, 'stripe', $2, 51.78, $3)`,
    [rows[0]!.id, provider_ref, status], c
  );
}

const statusOf = async (c: PoolClient, id: string) =>
  (await query<{ status: string }>(`SELECT status FROM orders.orders WHERE id = $1`, [id], c))
    .rows[0]?.status;

test("the settled sweep advances an order whose webhook went missing", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const id = await seedSale(c);
    await seedIntent(c, `pi_rec_settled_${Date.now()}`, "succeeded", id);

    const results = await sweepSettledIntents(c);
    assert.ok(
      results.some((r) => r.order_id === id && r.outcome === "advanced"),
      "the missed-webhook order was not advanced"
    );
    assert.equal(await statusOf(c, id), "Preparing");
  });
});

test("the abandonment sweep cancels a stale unpaid order and refunds its credit", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { rows: users } = await query<{ id: string; dorado_funds: number | null }>(
      `SELECT id, dorado_funds FROM exchange.users LIMIT 1`, [], c);
    assert.ok(users.length, "no users to test with");
    const user = users[0]!;
    const before = Number(user.dorado_funds ?? 0);

    const id = await seedSale(c, { user_id: user.id, ageHours: 48 });
    // The money row, as creation writes it: 125.50 of credit was reserved.
    await query(
      `INSERT INTO orders.transactions (order_id, funds, used_funds) VALUES ($1, 125.50, true)`,
      [id], c
    );
    // An intent that was never confirmed.
    await seedIntent(c, `pi_rec_stale_${Date.now()}`, "requires_payment_method", id);

    const results = await sweepAbandoned(24, c);
    const mine = results.find((r) => r.order_id === id);
    assert.ok(mine, "the stale order was not swept");
    assert.equal(mine.refunded, 125.5);
    assert.equal(await statusOf(c, id), "Cancelled");

    const { rows: after } = await query<{ dorado_funds: number | null }>(
      `SELECT dorado_funds FROM exchange.users WHERE id = $1`, [user.id], c);
    assert.equal(Number(after[0]!.dorado_funds ?? 0), before + 125.5, "the credit did not come back");

    const { rows: ledger } = await query<{ n: number }>(
      `SELECT count(*)::int n FROM payments.ledger
        WHERE order_id = $1 AND type = 'Credit'`, [id], c);
    assert.equal(ledger[0]!.n, 1, "the refund has no ledger entry");
  });
});

test("a YOUNG unpaid order is left alone", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const id = await seedSale(c, { ageHours: 1 });
    await sweepAbandoned(24, c);
    assert.equal(await statusOf(c, id), "Pending", "a fresh order was cancelled");
  });
});

test("a PROCESSING intent protects its order from the abandonment sweep", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const id = await seedSale(c, { ageHours: 72 });
    await seedIntent(c, `pi_rec_processing_${Date.now()}`, "processing", id);
    await sweepAbandoned(24, c);
    assert.equal(await statusOf(c, id), "Pending", "an order with money in flight was cancelled");
  });
});
