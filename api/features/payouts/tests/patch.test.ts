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
//   becomes 0; exchange.payouts.cost keeps what it would have been, so
//   un-waiving restores that number rather than guessing one out of a defaults
//   table that four production rows already disagree with - and they disagree
//   in BOTH directions, two WIRE rows below the default and two ECHECK rows
//   above it, which is why `cost` stays per-order data beside the flag.
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

  // A payout on a real PURCHASE order - the flag's column is
  // exchange.purchase_orders.waive_payout_fee, so a payout whose order is not
  // one has nowhere to record it and the endpoint says so.
  payout = (
    await outside<PayoutFixture>(
      `SELECT p.id, p.order_id, p.cost
         FROM exchange.payouts p
         JOIN exchange.purchase_orders po ON po.id = p.order_id
        ORDER BY p.id LIMIT 1`
    )
  )[0];
  assert.ok(payout, "dev needs a payout attached to a purchase order");
});

after(async () => {
  restoreSessions();
  await pool.end();
});

const readState = async (client: PoolClient) => {
  const { rows: legacy } = await client.query(
    `SELECT waive_payout_fee FROM exchange.purchase_orders WHERE id = $1`,
    [payout.order_id]
  );
  const { rows: next } = await client.query(
    `SELECT waive_payout_fee FROM orders.transactions WHERE order_id = $1`,
    [payout.order_id]
  );
  const { rows: fee } = await client.query(
    `SELECT cost FROM exchange.payouts WHERE id = $1`,
    [payout.id]
  );
  return {
    exchange: legacy[0]?.waive_payout_fee ?? null,
    next: next[0]?.waive_payout_fee ?? null,
    cost: fee[0]?.cost ?? null,
  };
};

test("waiving sets the flag in BOTH schemas and leaves the stored fee alone", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await as({ ...admin, role: "admin" }, async () => {
      const before = await readState(client);

      const res = await request(app)
        .patch(`/api/payouts/${payout.id}`)
        .send({ waive_payout_fee: true });
      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const after = await readState(client);
      assert.equal(after.exchange, true, "exchange.purchase_orders.waive_payout_fee did not move");
      // The new schema is reached by the MIRROR, not by a second write: the
      // column is on exchange.purchase_orders, so mirrorPurchaseOrder
      // re-derives it - which is also why a native-only write here would be
      // silently reverted by the next order write.
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
      assert.equal(after.exchange, false, "the flag did not come back off");
      assert.equal(after.next, false, "the mirror kept the flag on");
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
      assert.equal(after.exchange, true, "the waiver did not land");

      // And the fee reached the NEW schema's own column too - payout_fee is
      // not a column of exchange.purchase_orders, so the mirror cannot carry
      // it and editPayoutCharge writes it directly.
      const { rows } = await client.query(
        `SELECT payout_fee FROM orders.transactions WHERE order_id = $1`,
        [payout.order_id]
      );
      assert.equal(Number(rows[0]?.payout_fee), 125, "orders.transactions.payout_fee did not move");
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
      assert.equal(res.status, 400, `answered ${res.status}: ${JSON.stringify(res.body)}`);
      assert.match(res.body?.error?.message ?? "", /waive_payout_fee/);

      assert.deepEqual(await readState(client), before, "a refused document still wrote");
    });
  }, { lock: ORDER_LOCK });
});

test("nothing this file did survived the transactions", async () => {
  const [row] = await outside<{ waive_payout_fee: boolean | null; cost: string | null }>(
    `SELECT po.waive_payout_fee, p.cost
       FROM exchange.payouts p
       JOIN exchange.purchase_orders po ON po.id = p.order_id
      WHERE p.id = $1`,
    [payout.id]
  );
  assert.equal(row.cost, payout.cost, "a payout's real fee was moved in dev");
  assert.notEqual(row.waive_payout_fee, true, "a real order was left with its fee waived");
});
