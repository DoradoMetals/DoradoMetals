// PATCH /api/payouts/:id - the fee waiver, over real HTTP.
// The stored fee is never overwritten (D117): waiving sets a flag and the EFFECTIVE fee becomes 0; un-waiving restores the stored number rather than guessing.
// Each test asserts the value lands AND the record survives, not just a 200; nothing here is committed (pinned-pool.ts rolls back every query).
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";
import { LOCKS } from "#shared/testing/locks.ts";

const ORDER_LOCK = LOCKS.ORDERS;

await mockSessions();
const { default: app } = await import("#app");

// SELECT projections, not table rows.
type UserFixture = { id: string; name: string | null; email: string | null };
type PayoutFixture = { id: string; order_id: string; cost: string | null };

let admin: UserFixture;
let payout: PayoutFixture;

beforeAll(async () => {
  admin = (
    await outside<UserFixture>(`SELECT id, name, email FROM auth.users WHERE role = 'admin' LIMIT 1`)
  )[0];
  assert.ok(admin, "dev has no admin user");

  // A payout account on a real PURCHASE order: the flag's column, orders.transactions.waive_payout_fee, has nowhere to record it on a sale.
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

afterAll(async () => {
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

      assert.equal(after.cost, before.cost, "waiving overwrote the stored payout fee");
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
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
      assert.equal(after.cost, before.cost, "a round trip through the waiver moved the fee");
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

// The fee and the flag are different facts a document may carry both: production ECHECK rows are stored above the method default, a charge that a boolean cannot express.
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
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

// The flag has to reach the money, not just sit in two columns nothing reads: /quotes/order and the stored total both go through pricing/bid.ts's effectivePayoutFee.
test("waiving raises the order quote by exactly the stored fee", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...admin, role: "admin" }, async () => {
      // A known fee, so the difference is a number rather than whatever dev happens to hold.
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
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

test("a non-boolean waiver is refused by name and writes nothing", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await as({ ...admin, role: "admin" }, async () => {
      const before = await readState(client);

      const res = await request(app)
        .patch(`/api/payouts/${payout.id}`)
        .send({ waive_payout_fee: "yes" });
      // 400: a boolean field sent as a string is a SHAPE fact, refused by the
      // strict contract parse at transport before the service runs (D214 item 3).
      assert.equal(res.status, 400, `answered ${res.status}: ${JSON.stringify(res.body)}`);
      assert.match(res.body?.error?.message ?? "", /waive_payout_fee/);

      assert.deepEqual(await readState(client), before, "a refused document still wrote");
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

test("nothing this file did survived the transactions", async () => {
  // Reads orders.transactions, where patchPayout actually sends its writes - the old exchange.* columns are frozen and would pass however badly a transaction leaked.
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
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
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
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});
