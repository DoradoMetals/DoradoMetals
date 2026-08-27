// The one write on orders.transactions, against real Postgres.
//
// FOUR EXCHANGE FUNCTIONS, ONE STATEMENT. updateShippingActual,
// updateRefinerFee, updatePoolOzDeducted and updatePoolRemediation differed
// only in a column name, so they collapse into setAmount over a closed set of
// four. The column is interpolated, which is safe only because that set is
// closed - so the set itself is asserted below, not assumed.
//
// These are the amounts an ADMIN adjusts by hand. Everything else on this table
// is computed by the order service, which is why this is the only writer.
//
// Each test runs inside a transaction that is rolled back.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import pool from "#db";
import * as transactions from "#features/orders/transactions/repo.ts";

let client;

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

async function inRollback(fn) {
  await client.query("BEGIN");
  try {
    await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

const anOrderWithMoney = async (c) =>
  (await c.query("SELECT order_id FROM orders.transactions ORDER BY order_id LIMIT 1"))
    .rows[0]?.order_id ?? null;

const FIELDS = [
  "shipping_fee_actual", "refiner_fee", "pool_oz_deducted", "pool_remediation",
  // exchange's payouts.cost. A per-order fee, split off the payout row by 073.
  "payout_fee",
];

test("each amount lands in its own column and disturbs no other", async () => {
  await inRollback(async (c) => {
    const id = await anOrderWithMoney(c);
    assert.ok(id, "no order has a transactions row - this test proves nothing");

    for (const [i, field] of FIELDS.entries()) {
      // Zero them all first, so each assertion is about this one call.
      await c.query(
        // EVERY field in FIELDS, not a hand-written list - adding payout_fee to
        // the closed set and forgetting it here made the isolation check fail
        // on a column it had never reset.
        `UPDATE orders.transactions SET ${FIELDS.map((f, i) => `${f} = $${i + 2}`).join(", ")}
          WHERE order_id = $1`, [id, ...FIELDS.map(() => 0)]
      );
      // A distinct value per field, so a mix-up between two columns shows.
      const value = 10 + i;

      const returned = await transactions.setAmount(id, field, value, "alice", c);
      assert.equal(Number(returned.value), value, `${field} did not report what it wrote`);

      const { rows: [row] } = await c.query(
        // Derived from FIELDS as well: selecting a hand-written list left the
        // new column undefined, and Number(undefined) is NaN, which fails with
        // a message that blames the wrong column.
        `SELECT ${FIELDS.join(", ")}, updated_by
           FROM orders.transactions WHERE order_id = $1`, [id]
      );
      assert.equal(Number(row[field]), value, `${field} was not written`);
      assert.equal(row.updated_by, "alice");
      for (const other of FIELDS) {
        if (other === field) continue;
        assert.equal(Number(row[other]), 0, `setting ${field} also changed ${other}`);
      }
    }
  });
});

// None of the four exchange statements touched updated_by, so a caller that
// does not know the admin must leave the previous author alone.
test("an amount written with no author preserves the previous one", async () => {
  await inRollback(async (c) => {
    const id = await anOrderWithMoney(c);
    assert.ok(id, "no order has a transactions row");
    await c.query(
      "UPDATE orders.transactions SET updated_by = 'alice' WHERE order_id = $1", [id]
    );

    await transactions.setAmount(id, "refiner_fee", 7, null, c);

    const { rows: [row] } = await c.query(
      "SELECT refiner_fee, updated_by FROM orders.transactions WHERE order_id = $1", [id]
    );
    assert.equal(Number(row.refiner_fee), 7);
    assert.equal(row.updated_by, "alice", "a null author erased the previous one");
  });
});

test("an amount can be cleared back to null", async () => {
  await inRollback(async (c) => {
    const id = await anOrderWithMoney(c);
    assert.ok(id, "no order has a transactions row");
    await c.query(
      "UPDATE orders.transactions SET refiner_fee = 42 WHERE order_id = $1", [id]
    );

    const returned = await transactions.setAmount(id, "refiner_fee", null, null, c);
    assert.equal(returned.value, null);
  });
});

test("the amount set is closed to exactly five names", () => {
  assert.deepEqual(Object.keys(transactions.AMOUNTS).sort(), [...FIELDS].sort());
  for (const [key, column] of Object.entries(transactions.AMOUNTS)) {
    assert.equal(key, column, "an amount key and its column name must match");
    assert.match(column, /^[a-z_]+$/, "an amount column must be a bare identifier");
  }
});
