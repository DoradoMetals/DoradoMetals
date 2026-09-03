// PATCH /api/payouts/:id - the fee waiver, over real HTTP.
//
// WHY THIS EXISTS. Jacob, 2026-08-29, on the four production payouts whose
// stored cost disagrees with features/payouts/constants.ts: "Yes those are
// cases we have waived it. Would actually be somewhat nice to have a checkbox
// for waiving fee or something."
//
// `orders.transactions.waive_payout_fee` ALREADY EXISTED - read, composed and
// mirrored - with no writer and no UI, so this is a PATCH field and a checkbox
// rather than new plumbing. What the field has to be worth asserting is the
// design constraint, and it is the whole reason a flag was the answer rather
// than an UPDATE to zero:
//
//   THE STORED FEE IS NOT OVERWRITTEN. D117 - a stored fee is a RECORD and
//   must never be re-derived. Waiving sets the flag and the EFFECTIVE fee
//   becomes 0; orders.transactions.payout_fee keeps what it would have been,
//   so un-waiving restores that number rather than guessing one out of a
//   defaults table that four production rows already disagree with - which is
//   why the fee stays per-order data beside the flag.
//
// EACH TEST ASSERTS THE VALUE LANDS AND THE RECORD SURVIVES, not that the
// route answered 200: a handler that returns early answers 200 too.
//
// NOTHING IS COMMITTED - shared/testing/pinned-pool.ts holds every query in one
// transaction that is rolled back, and the last test proves it.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";
import { LOCKS } from "#shared/testing/locks.ts";

const ORDER_LOCK = LOCKS.ORDERS;

await mockSessions();
const { default: app } = await import("#app");

// THE STRUCTURAL SUBSET EACH FIXTURE ACTUALLY HAS - SELECT projections, not
// table rows.
type UserFixture = { id: string; name: string | null; email: string | null };
type PayoutFixture = { id: string; order_id: string; cost: string | null };

let admin: UserFixture;
let payout: PayoutFixture;

before(async () => {
  admin = (
    await outside<UserFixture>(`SELECT id, name, email FROM exchange.users WHERE role = 'admin' LIMIT 1`)
  )[0];
  assert.ok(admin, "dev has no admin user");

  // A payout account on a real PURCHASE order. NATIVE SINCE D213: the id the
  // endpoint takes is the payments.details id (what the composed order now
  // serves as order.payout.id), the order is reached through
  // orders.transactions.payout_details_id, and the flag's column is
  // orders.transactions.waive_payout_fee - so a payout whose order is not a
  // purchase has nowhere to record it and the endpoint says so.
  payout = (
    await outside<PayoutFixture>(
      `SELECT d.id, t.order_id, t.payout_fee AS cost
         FROM payments.details d
         JOIN orders.transactions t ON t.payout_details_id = d.id
         JOIN orders.orders o ON o.id = t.order_id
        WHERE o.direction = 'purchase'
        ORDER BY d.id LIMIT 1`
    )
  )[0];
  assert.ok(payout, "dev needs a payout account attached to a purchase order");
});

after(async () => {
  restoreSessions();
  await pool.end();
});

const readState = async (client: PoolClient) => {
  const { rows: next } = await client.query(
    `SELECT waive_payout_fee, payout_fee FROM orders.transactions WHERE order_id = $1`,
    [payout.order_id]
  );
  return {
    next: next[0]?.waive_payout_fee ?? null,
    cost: next[0]?.payout_fee ?? null,
  };
};

test("waiving sets the flag and leaves the stored fee alone", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await as({ ...admin, role: "admin" }, async () => {
      const before = await readState(client);

      const res = await request(app)
        .patch(`/api/payouts/${payout.id}`)
        .send({ waive_payout_fee: true });
      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const after = await readState(client);
      assert.equal(after.next, true, "orders.transactions.waive_payout_fee did not move");

      // THE POINT OF THE WHOLE DESIGN. The record stands.
      assert.equal(after.cost, before.cost, "waiving overwrote the stored payout fee");
    });
  }, { lock: ORDER_LOCK });
});

test("un-waiving clears the flag and the stored fee is still the same number", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await as({ ...admin, role: "admin" }, async () => {
      const before = await readState(client);

      const on = await request(app)
        .patch(`/api/payouts/${payout.id}`)
        .send({ waive_payout_fee: true });
      assert.equal(on.status, 200, `waive answered ${on.status}`);

      const off = await request(app)
        .patch(`/api/payouts/${payout.id}`)
        .send({ waive_payout_fee: false });
      assert.equal(off.status, 200, `un-waive answered ${off.status}`);

      const after = await readState(client);
      assert.equal(after.next, false, "the flag did not come back off");
      // Un-waiving does not have to GUESS what the fee was, which is what a
      // waiver implemented as `cost = 0` would have forced.
      assert.equal(after.cost, before.cost, "a round trip through the waiver moved the fee");
    });
  }, { lock: ORDER_LOCK });
});

// The fee and the flag are different facts and a document may carry both: the
// ECHECK rows in production are stored ABOVE the method default, which is a
// charge, and a boolean cannot express one.
test("a document may set the fee and waive it, and both are recorded", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await as({ ...admin, role: "admin" }, async () => {
      const res = await request(app)
        .patch(`/api/payouts/${payout.id}`)
        .send({ cost: 125, waive_payout_fee: true });
      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const after = await readState(client);
      assert.equal(Number(after.cost), 125, "the per-order fee did not land");
      assert.equal(after.next, true, "the waiver did not land");
    });
  }, { lock: ORDER_LOCK });
});

// THE FLAG HAS TO REACH THE MONEY, and a write that lands in two columns
// nothing reads would be the exact failure this field started as: it was read,
// composed and mirrored, with no writer and no UI. /quotes/order is the drawer
// estimate; calculateTotalPrice is the stored total; both go through
// pricing/bid.ts's effectivePayoutFee, so proving one over HTTP proves the
// expression they share is really wired.
test("waiving raises the order quote by exactly the stored fee", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...admin, role: "admin" }, async () => {
      // A known fee, so the difference is a number rather than whatever dev
      // happens to hold.
      const set = await request(app)
        .patch(`/api/payouts/${payout.id}`)
        .send({ cost: 20, waive_payout_fee: false });
      assert.equal(set.status, 200, `setting the fee answered ${set.status}`);

      const charged = await request(app)
        .post("/api/quotes/order")
        .send({ order_id: payout.order_id });
      assert.equal(charged.status, 200, `the quote answered ${charged.status}: ${JSON.stringify(charged.body)}`);

      const waive = await request(app)
        .patch(`/api/payouts/${payout.id}`)
        .send({ waive_payout_fee: true });
      assert.equal(waive.status, 200, `waiving answered ${waive.status}`);

      const waived = await request(app)
        .post("/api/quotes/order")
        .send({ order_id: payout.order_id });
      assert.equal(waived.status, 200, `the waived quote answered ${waived.status}`);

      assert.equal(
        Number(waived.body.total) - Number(charged.body.total),
        20,
        "waiving the fee did not change what the order is worth"
      );
    });
  }, { lock: ORDER_LOCK });
});

test("a non-boolean waiver is refused by name and writes nothing", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await as({ ...admin, role: "admin" }, async () => {
      const before = await readState(client);

      const res = await request(app)
        .patch(`/api/payouts/${payout.id}`)
        .send({ waive_payout_fee: "yes" });
      // 422, NOT 400 (D214 item 11): the payout service refuses this itself,
      // and a domain refusal is Invalid.
      assert.equal(res.status, 422, `answered ${res.status}: ${JSON.stringify(res.body)}`);
      assert.match(res.body?.error?.message ?? "", /waive_payout_fee/);

      assert.deepEqual(await readState(client), before, "a refused document still wrote");
    });
  }, { lock: ORDER_LOCK });
});

test("nothing this file did survived the transactions", async () => {
  // READ THE TABLE THE WRITES ACTUALLY LAND ON. This asserted against
  // exchange.purchase_orders and exchange.payouts, which D212 froze - so it
  // was reading columns no endpoint here has written since, and would have
  // passed however badly the transaction leaked. Both facts live on
  // orders.transactions now, which is where patchPayout sends them.
  const [row] = await outside<{ waive_payout_fee: boolean | null; cost: string | null }>(
    `SELECT t.waive_payout_fee, t.payout_fee AS cost
       FROM orders.transactions t
      WHERE t.payout_details_id = $1`,
    [payout.id]
  );
  assert.equal(row.cost, payout.cost, "a payout's real fee was moved in dev");
  assert.notEqual(row.waive_payout_fee, true, "a real order was left with its fee waived");
});

// THE METHOD CHANGE, AND THE JOIN THAT DID NOT EXIST. Before 099 this walked
// order -> payments.intents -> details, and an intent is money coming IN, so
// it matched no rows for every payout it was meant to serve while every test
// passed (D168). The write is keyed on the payout's OWN id now, so there is no
// walk left to break - and this pins that the method really moves.
test("changing the method lands on the named payout account", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await as({ ...admin, role: "admin" }, async () => {
      const res = await request(app)
        .patch(`/api/payouts/${payout.id}`)
        .send({ method: "WIRE" });
      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const { rows } = await client.query(
        `SELECT m.type FROM payments.details d
           JOIN payments.methods m ON m.id = d.method_id
          WHERE d.id = $1`,
        [payout.id]
      );
      assert.equal(rows[0]?.type, "WIRE", "the method change did not reach the account");
    });
  }, { lock: ORDER_LOCK });
});

test("a method that names no payment method is refused, and nothing changes", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await as({ ...admin, role: "admin" }, async () => {
      const before = await client.query(
        `SELECT method_id FROM payments.details WHERE id = $1`, [payout.id]
      );

      const res = await request(app)
        .patch(`/api/payouts/${payout.id}`)
        .send({ method: "NOT A METHOD" });
      // 422, NOT 400 (D214 item 11): the payout service refuses this itself,
      // and a domain refusal is Invalid.
      assert.equal(res.status, 422, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const after = await client.query(
        `SELECT method_id FROM payments.details WHERE id = $1`, [payout.id]
      );
      assert.equal(after.rows[0].method_id, before.rows[0].method_id, "a refused change wrote");
    });
  }, { lock: ORDER_LOCK });
});
