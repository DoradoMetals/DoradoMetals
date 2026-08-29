// The payout, in both schemas, against real Postgres and rolled back.
//
// WHY THIS FILE EXISTS. exchange.payouts was one of the three writes ruling 36
// does not reach (D168): the exchange statement was the ONLY statement, filed
// under repo.dual.js's "features that have not moved" beside insertPayout. Two
// thirds of that was already false - 073 had moved the account to
// payments.details and the fee to orders.transactions.payout_fee - and the
// third, the order link, pointed through payments.intents, which is money
// coming IN and therefore does not exist for a purchase order. 099 added
// orders.transactions.payout_details_id and this pins what now happens.
//
// THE PIN THAT MATTERS IS THE SUBJECT. Every assertion below runs against a
// PURCHASE order, because that is the only kind that has a payout. The tests
// this replaces picked whatever intent carried an order, which was always a
// sales order, and passed while the live path wrote nothing.
import test from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";

import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import * as orders from "#features/orders/service.ts";
import query from "#shared/db/query.js";

// LOCKS.ORDERS, because this file WRITES orders.transactions and
// exchange.payouts, and shared/testing/locks.ts puts both in the 4213 group.
// A file that writes them and takes no lock is the shape that registry exists
// to prevent - "two files writing the same tables deadlock in the full run and
// pass in isolation, which has happened twice in this codebase".
//
// HONEST NOTE ON WHY IT WAS ADDED: a gate run appeared to hang here and I
// diagnosed a deadlock. IT WAS NOT ONE. The dev database is remote and a round
// trip costs ~160ms, so the order-placing files take minutes rather than
// seconds and node --test prints nothing until a file finishes. The lock is
// still correct - the registry's rule is about which tables a file writes, not
// about whether a hang was observed - but it was not what was wrong.
const ORDERS = { lock: LOCKS.ORDERS };

// A purchase order with a payout AND a transactions row - the only subject on
// which any of this is answerable. Asserted rather than assumed, because a
// query that finds nothing makes every test below vacuous.
const subject = async (c: PoolClient) => {
  const { rows } = await query<{ order_id: string; payout_id: string; cost: number | null }>(
    `SELECT p.order_id, p.id AS payout_id, p.cost
       FROM exchange.payouts p
       JOIN orders.transactions t ON t.order_id = p.order_id
       JOIN orders.orders o ON o.id = p.order_id
      WHERE o.direction = 'purchase'
      ORDER BY p.order_id LIMIT 1`,
    [],
    c
  );
  assert.ok(rows.length, "dev has no purchase order with a payout - these tests would assert nothing");
  return rows[0];
};

// THE INVARIANT 100 ESTABLISHED, checked against every row rather than a sample.
// If a payout ever lands in exchange without its new-schema half, this is what
// says so - and it is the only assertion here that would still mean something
// after exchange stops being written.
test("every payout has an account link and a fee that agrees", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { rows: [row] } = await query<{
      payouts: number; linked: number; fee_agrees: number;
    }>(
      `SELECT count(*)::int AS payouts,
              count(*) FILTER (WHERE t.payout_details_id = p.id)::int AS linked,
              count(*) FILTER (WHERE t.payout_fee IS NOT DISTINCT FROM p.cost)::int AS fee_agrees
         FROM exchange.payouts p
         JOIN orders.transactions t ON t.order_id = p.order_id`,
      [],
      c
    );
    assert.ok(row.payouts > 0, "no payouts to check");
    assert.equal(row.linked, row.payouts, "a payout has no account link in the new schema");
    assert.equal(row.fee_agrees, row.payouts, "a payout fee disagrees between the schemas");
  }, ORDERS);
});

test("editing the payout charge moves BOTH copies, not just exchange", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { order_id } = await subject(c);
    const next = 41.37;

    await orders.editPayoutCharge({ order_id, payout_charge: next });

    const { rows: [row] } = await query<{ cost: number | null; payout_fee: number | null }>(
      `SELECT p.cost, t.payout_fee
         FROM exchange.payouts p JOIN orders.transactions t ON t.order_id = p.order_id
        WHERE p.order_id = $1`,
      [order_id],
      c
    );
    assert.equal(Number(row.cost), next, "the exchange copy did not move");
    assert.equal(Number(row.payout_fee), next, "orders.transactions.payout_fee did not move");
  }, ORDERS);
});

test("changing the payout method moves BOTH copies", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { order_id } = await subject(c);

    await orders.changePayoutMethod({ order_id, method: "WIRE" });

    const { rows: [row] } = await query<{ method: string; type: string | null }>(
      `SELECT p.method, m.type
         FROM exchange.payouts p
         JOIN orders.transactions t ON t.order_id = p.order_id
         LEFT JOIN payments.details d ON d.id = t.payout_details_id
         LEFT JOIN payments.methods m ON m.id = d.method_id
        WHERE p.order_id = $1`,
      [order_id],
      c
    );
    assert.equal(row.method, "WIRE", "the exchange copy did not move");
    assert.equal(row.type, "WIRE", "payments.details still names the old method");
  }, ORDERS);
});

// THE REGRESSION PIN, and it is the whole point of the migration.
//
// If the method change is ever routed back through payments.intents, the test
// above would go on passing only if the subject happened to have an intent.
// This asserts it does not - so the previous implementation could not have
// produced that result, and the one that did is reading the new link.
test("the subject purchase order has no payment intent, so the old join could not have worked", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { order_id } = await subject(c);
    const { rows: [row] } = await query<{ n: number }>(
      `SELECT count(*)::int AS n FROM payments.intents WHERE order_id = $1`,
      [order_id],
      c
    );
    assert.equal(row.n, 0, "this order HAS an intent - pick a different subject or the pin is empty");
  }, ORDERS);
});

// The standing constraint, from the order side rather than the repo side.
test("no bank number reaches the new schema on any payout path", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { rows: [row] } = await query<{ routing: number; account: number }>(
      `SELECT count(*) FILTER (WHERE routing_number IS NOT NULL)::int AS routing,
              count(*) FILTER (WHERE account_number IS NOT NULL)::int AS account
         FROM payments.details`,
      [],
      c
    );
    assert.equal(row.routing, 0, "a routing number is stored in payments.details");
    assert.equal(row.account, 0, "an account number is stored in payments.details");
  }, ORDERS);
});
