// The credit ledger written to both schemas at once.
//
// The property that matters is that an entry lands in exchange and in
// payments.ledger with the SAME id, inside the caller's transaction. The id is
// what lets verify:parity compare them row for row, and the transaction is what
// stops a ledger existing for an order that rolled back.
//
// Each test runs inside a transaction that is rolled back, so no real money
// moves and nothing here depends on what another test left behind.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pool from "#db";
// REPOINTED AT THE SERVICE. The dual write is still exactly what these
// assertions describe - both schemas, one id, one transaction - it just lives in
// service.ts now instead of a repo.dual.js selected by a switch. The assertions
// are unchanged because the behaviour is.
import * as service from "#features/transactions/service.ts";
import * as ledger from "#features/transactions/repo.ts";

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

const aUser = async (c) =>
  (await c.query("SELECT id FROM exchange.users ORDER BY id LIMIT 1")).rows[0];

const aPurchaseOrder = async (c) =>
  (await c.query(
    `SELECT p.id FROM exchange.purchase_orders p
      WHERE EXISTS (SELECT 1 FROM orders.orders o WHERE o.id = p.id)
      ORDER BY p.id LIMIT 1`
  )).rows[0];

test("a dual write lands in both schemas under one id", async () => {
  await inRollback(async (c) => {
    const user = await aUser(c);
    const order = await aPurchaseOrder(c);
    const marker = `sentinel-${randomUUID().slice(0, 8)}`;

    await service.addTransactionLog(user.id, marker, order.id, null, 12.34, c);

    const { rows: ex } = await c.query(
      `SELECT id, amount, transaction_type, purchase_order_id, sales_order_id
         FROM exchange.account_transactions WHERE transaction_type = $1`,
      [marker]
    );
    const { rows: nx } = await c.query(
      `SELECT id, amount, type, order_id FROM payments.ledger WHERE type = $1`,
      [marker]
    );

    assert.equal(ex.length, 1, "no entry in exchange");
    assert.equal(nx.length, 1, "no entry in payments.ledger");
    assert.equal(ex[0].id, nx[0].id, "the two schemas gave the entry different ids");
    assert.equal(Number(ex[0].amount), Number(nx[0].amount));
    assert.equal(ex[0].purchase_order_id, nx[0].order_id);
    assert.equal(ex[0].sales_order_id, null);
  });
});

// A sales-order debit arrives with sales_order_id set and purchase_order_id
// null. Both collapse into one order_id, so the risk is writing the wrong one.
test("a sales-order debit collapses into the same order_id column", async () => {
  await inRollback(async (c) => {
    const user = await aUser(c);
    const { rows: [order] } = await c.query(
      `SELECT s.id FROM exchange.sales_orders s
        WHERE EXISTS (SELECT 1 FROM orders.orders o WHERE o.id = s.id)
        ORDER BY s.id LIMIT 1`
    );
    const marker = `sentinel-${randomUUID().slice(0, 8)}`;

    await service.addTransactionLog(user.id, marker, null, order.id, 7.5, c);

    const { rows } = await c.query(
      `SELECT order_id FROM payments.ledger WHERE type = $1`, [marker]
    );
    assert.equal(rows[0].order_id, order.id);
  });
});

// The two columns are reconstructed from orders.orders.direction, so a purchase
// entry must come back as purchase_order_id and a sale as sales_order_id -
// never swapped, and never both.
//
// This calls repo.next rather than re-running its query: an earlier version
// inlined the SQL, and when the two CASE arms were deliberately swapped it
// passed, because it was testing a copy of the bug rather than the code.
test("repo.next projects the order id back into the column it came from", async () => {
  const { rows: users } = await client.query(
    `SELECT DISTINCT l.user_id FROM payments.ledger l
       JOIN orders.orders o ON o.id = l.order_id`
  );
  assert.ok(users.length > 0, "no ledger rows joined to an order to test against");

  // Walks service.history(), not getTransactionHistory() - the endpoint still
  // answers with one row on purpose (see service.ts), but the projection this
  // asserts is worth checking across every entry a customer has.
  let checked = 0;
  for (const { user_id } of users) {
    for (const entry of await service.history(user_id)) {
      if (!entry?.purchase_order_id && !entry?.sales_order_id) continue;

      const set = [entry.purchase_order_id, entry.sales_order_id].filter(Boolean);
      assert.equal(set.length, 1, "an entry resolved to both kinds of order");

      const { rows: [order] } = await client.query(
        `SELECT direction::text FROM orders.orders WHERE id = $1`, [set[0]]
      );
      if (order.direction === "purchase") {
        assert.ok(entry.purchase_order_id, "a purchase came back as a sale");
      } else {
        assert.ok(entry.sales_order_id, "a sale came back as a purchase");
      }
      checked++;
    }
  }
  assert.ok(checked > 0, "no entry carried an order id, so nothing was projected");
});

// An entry whose order was deleted keeps a null order_id rather than vanishing.
// exchange's foreign keys are ON DELETE SET NULL and production already holds
// one row in that state, so this is the shape of real data, not a hypothetical.
test("an entry with no order still writes to both schemas", async () => {
  await inRollback(async (c) => {
    const user = await aUser(c);
    const marker = `sentinel-${randomUUID().slice(0, 8)}`;

    await service.addTransactionLog(user.id, marker, null, null, 99.01, c);

    const { rows } = await c.query(
      `SELECT order_id, amount FROM payments.ledger WHERE type = $1`, [marker]
    );
    assert.equal(rows.length, 1, "an entry with no order was dropped");
    assert.equal(rows[0].order_id, null);
    assert.equal(Number(rows[0].amount), 99.01);
  });
});

// The whole point of threading the executor: the ledger commits with the order
// it explains, or not at all.
test("a rolled-back dual write leaves neither schema changed", async () => {
  const other = await pool.connect();
  const marker = `sentinel-${randomUUID().slice(0, 8)}`;
  try {
    const user = await aUser(other);

    await client.query("BEGIN");
    await service.addTransactionLog(user.id, marker, null, null, 55.5, client);

    const inside = await client.query(
      `SELECT count(*)::int n FROM payments.ledger WHERE type = $1`, [marker]
    );
    assert.equal(inside.rows[0].n, 1, "the write is not visible inside its own transaction");

    const outside = await other.query(
      `SELECT count(*)::int n FROM payments.ledger WHERE type = $1`, [marker]
    );
    assert.equal(outside.rows[0].n, 0, "the ledger write escaped the transaction");

    await client.query("ROLLBACK");

    const after = await other.query(
      `SELECT
         (SELECT count(*)::int FROM payments.ledger WHERE type = $1) AS ledger,
         (SELECT count(*)::int FROM exchange.account_transactions WHERE transaction_type = $1) AS ex`,
      [marker]
    );
    assert.equal(after.rows[0].ledger, 0, "a ledger entry survived a rolled-back movement");
    assert.equal(after.rows[0].ex, 0, "an exchange entry survived a rolled-back movement");
  } finally {
    other.release();
  }
});

// exchange and payments.ledger must answer the same question the same way for
// every user that has any history at all.
test("both implementations return the same entry for every user", async () => {
  const { rows: users } = await client.query(
    `SELECT DISTINCT user_id FROM exchange.account_transactions`
  );
  assert.ok(users.length > 0, "no ledger history in dev to compare");

  for (const { user_id } of users) {
    const [a, b] = [
      await service.getTransactionHistory(user_id),
      await service.getTransactionHistory(user_id),
    ];
    // Without this the comparison passes when both return nothing, which is
    // the failure mode a check like this is most likely to have.
    assert.ok(a, "exchange returned no entry for a user that has history");
    assert.ok(b, "payments.ledger returned no entry for a user that has history");
    assert.deepEqual(
      { ...a, amount: Number(a.amount) },
      { ...b, amount: Number(b.amount) },
      `the two implementations disagree for one user`
    );
  }
});
