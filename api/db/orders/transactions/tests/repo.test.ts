// The one write on orders.transactions, against real Postgres.
//
// ONE UPDATE (Jacob, 2026-09-02): the patch object names the columns, the
// repo builds the statement from a closed whitelist. The columns are
// interpolated, which is safe only because that set is closed - so the
// whitelist's behaviour is asserted below, not assumed: an unknown key is
// ignored, an empty patch writes nothing, and the direction guard answers
// with zero rows rather than writing the wrong direction's order.
//
// These are the amounts an ADMIN adjusts by hand plus the payout link and the
// waiver. Everything else on this table is computed by the order service.
//
// Each test runs inside a transaction that is rolled back.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#db";
import * as transactions from "#db/orders/transactions/repo.ts";

let client: PoolClient;

before(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
  client = await pool.connect();
});

after(async () => {
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

const anOrderWithMoney = async (c: PoolClient, direction?: string) =>
  (
    await c.query(
      `SELECT t.order_id FROM orders.transactions t
        JOIN orders.orders o ON o.id = t.order_id
       ${direction ? "WHERE o.direction = $1::orders.direction" : ""}
       ORDER BY t.order_id LIMIT 1`,
      direction ? [direction] : []
    )
  ).rows[0]?.order_id ?? null;

// The five adjustable money columns - a hand-written copy of the repo's
// whitelist so a drift in either direction fails a test rather than passing
// silently.
const AMOUNT_FIELDS = [
  "shipping_fee_actual", "refiner_fee", "pool_oz_deducted", "pool_remediation",
  // exchange's payouts.cost. A per-order fee, split off the payout row by 073.
  "payout_fee",
] as const;

test("each amount lands in its own column and disturbs no other", async () => {
  await inRollback(async (c: PoolClient) => {
    const id = await anOrderWithMoney(c);
    assert.ok(id, "no order has a transactions row - this test proves nothing");

    for (const [i, field] of AMOUNT_FIELDS.entries()) {
      // Zero them all first, so each assertion is about this one call.
      await c.query(
        `UPDATE orders.transactions SET ${AMOUNT_FIELDS.map((f, j) => `${f} = $${j + 2}`).join(", ")}
          WHERE order_id = $1`, [id, ...AMOUNT_FIELDS.map(() => 0)]
      );
      // A distinct value per field, so a mix-up between two columns shows.
      const value = 10 + i;

      const returned = await transactions.update(id, { [field]: value }, {}, c);
      assert.ok(returned, `update returned nothing for ${field}`);

      const { rows: [row] } = await c.query(
        `SELECT ${AMOUNT_FIELDS.join(", ")}, updated_by
           FROM orders.transactions WHERE order_id = $1`, [id]
      );
      assert.equal(Number(row[field]), value, `${field} was not written`);
      for (const other of AMOUNT_FIELDS) {
        if (other === field) continue;
        assert.equal(Number(row[other]), 0, `setting ${field} also changed ${other}`);
      }
    }
  });
});

test("a patch that names no author preserves the previous one", async () => {
  await inRollback(async (c: PoolClient) => {
    const id = await anOrderWithMoney(c);
    assert.ok(id, "no order has a transactions row");
    await c.query(
      "UPDATE orders.transactions SET updated_by = 'alice' WHERE order_id = $1", [id]
    );

    await transactions.update(id, { refiner_fee: 7 }, {}, c);

    const { rows: [row] } = await c.query(
      "SELECT refiner_fee, updated_by FROM orders.transactions WHERE order_id = $1", [id]
    );
    assert.equal(Number(row.refiner_fee), 7);
    assert.equal(row.updated_by, "alice", "an omitted author erased the previous one");
  });
});

test("an amount can be cleared back to null", async () => {
  await inRollback(async (c: PoolClient) => {
    const id = await anOrderWithMoney(c);
    assert.ok(id, "no order has a transactions row");
    await c.query(
      "UPDATE orders.transactions SET refiner_fee = 42 WHERE order_id = $1", [id]
    );

    const returned = await transactions.update(id, { refiner_fee: null }, {}, c);
    assert.ok(returned, "update returned nothing when clearing refiner_fee");

    const { rows: [row] } = await c.query(
      "SELECT refiner_fee FROM orders.transactions WHERE order_id = $1", [id]
    );
    assert.equal(row.refiner_fee, null, "the fee did not clear to null");
  });
});

test("one patch writes several columns in one statement", async () => {
  await inRollback(async (c: PoolClient) => {
    const id = await anOrderWithMoney(c);
    assert.ok(id, "no order has a transactions row");

    const returned = await transactions.update(
      id, { payout_fee: 25, waive_payout_fee: true }, {}, c
    );
    assert.ok(returned, "the two-column patch wrote nothing");

    const { rows: [row] } = await c.query(
      "SELECT payout_fee, waive_payout_fee FROM orders.transactions WHERE order_id = $1", [id]
    );
    assert.equal(Number(row.payout_fee), 25);
    assert.equal(row.waive_payout_fee, true);
  });
});

test("an empty patch writes nothing and says so", async () => {
  await inRollback(async (c: PoolClient) => {
    const id = await anOrderWithMoney(c);
    assert.ok(id, "no order has a transactions row");
    const returned = await transactions.update(id, {}, {}, c);
    assert.equal(returned, undefined, "an empty patch claimed to have written");
  });
});

test("an unknown key never reaches the statement", async () => {
  await inRollback(async (c: PoolClient) => {
    const id = await anOrderWithMoney(c);
    assert.ok(id, "no order has a transactions row");
    // The whitelist is the defence: a key outside it is dropped, so a patch of
    // ONLY unknown keys is the empty patch. If the key were interpolated this
    // would instead raise (or worse, write).
    const returned = await transactions.update(
      id, { evil: 1 } as never, {}, c
    );
    assert.equal(returned, undefined, "an unknown key produced a write");
  });
});

test("the direction guard refuses the wrong direction's order", async () => {
  await inRollback(async (c: PoolClient) => {
    const saleId = await anOrderWithMoney(c, "sale");
    assert.ok(saleId, "no sales order has a transactions row - this test proves nothing");

    const refused = await transactions.update(
      saleId, { waive_payout_fee: true }, { direction: "purchase" }, c
    );
    assert.equal(refused, undefined, "a purchase-guarded write landed on a sale");

    const allowed = await transactions.update(
      saleId, { waive_payout_fee: true }, { direction: "sale" }, c
    );
    assert.ok(allowed, "the matching guard refused its own direction");
  });
});
