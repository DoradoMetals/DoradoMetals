// The refiner-side edits and the payout-details read, over real HTTP - on the
// refiners feature's own endpoints since the resource-ownership ruling (28
// August): a fact about the refiner engagement lands on refiners.orders, a
// fact about a line's assay on refiners.items.
//
// Three of these routes' ancestors no test had ever driven - the list that
// produced four production defects. These are the figures that decide what
// the REFINER is paid against what the customer was offered.
//
// THE ENGAGEMENT TESTS APPLY MIGRATION 093 INSIDE THEIR PINNED TRANSACTION.
// refiners.orders does not exist in dev until the user applies 092+093, and
// the endpoint honestly 500s without it. Executing the migration file inside
// the rolled-back transaction gives the tests the real schema - the same
// trick verify:genesis has always used - and stays a no-op once the
// migration is really applied (CREATE IF NOT EXISTS + guarded backfill).
// This is also where the MIRROR INVARIANT is pinned: one engagement per
// order, items matched one-to-one, spots covered.
//
// NOTHING IS COMMITTED. shared/testing/pinned-pool.js holds every query in
// one transaction that is rolled back.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";
import { LOCKS } from "#shared/testing/locks.ts";

// The engagement tests ALTER refiners.items/spots on the way through 093, and
// order-writing files touch those tables through the dual mirror - the ORDERS
// lock serialises against every one of them.
const ORDER_LOCK = LOCKS.ORDERS;

await mockSessions();
const { default: app } = await import("#app");

const MIGRATION = fs.readFileSync(
  new URL("../../migrations/093_the_refiner_engagement_gets_its_own_orders.sql", import.meta.url),
  "utf8"
);

let admin;
let customer;
let refinerMetal; // { purchase_order_id, type } - an order with refiner spots
let scrapItem; // a scrap-backed purchase line
let payoutId;

before(async () => {
  admin = (
    await outside(`SELECT id, name, email FROM exchange.users WHERE role = 'admin' LIMIT 1`)
  )[0];
  assert.ok(admin, "dev has no admin user");

  customer = (
    await outside(
      `SELECT id, name, email FROM exchange.users WHERE role IS DISTINCT FROM 'admin' LIMIT 1`
    )
  )[0];
  assert.ok(customer, "dev has no non-admin user - the refusal tests would prove nothing");

  refinerMetal = (
    await outside(
      `SELECT purchase_order_id, type FROM exchange.refiner_metals
        WHERE purchase_order_id IS NOT NULL
          AND purchase_order_id IN (SELECT id FROM orders.orders)
        ORDER BY id LIMIT 1`
    )
  )[0];
  assert.ok(refinerMetal, "dev needs a refiner_metals row on a mirrored purchase order");

  scrapItem = (
    await outside(
      `SELECT i.id, i.purchase_order_id, s.id AS scrap_id
         FROM exchange.purchase_order_items i
         JOIN exchange.scrap s ON s.id = i.scrap_id
        ORDER BY i.id LIMIT 1`
    )
  )[0];
  assert.ok(scrapItem, "dev needs a purchase order item with scrap");

  payoutId = (
    await outside(
      `SELECT id FROM exchange.payouts WHERE order_id IS NOT NULL ORDER BY id LIMIT 1`
    )
  )[0]?.id;
  assert.ok(payoutId, "dev needs a payout attached to an order");
});

after(async () => {
  restoreSessions();
  await pool.end();
});

// 093 inside the pinned transaction, and the engagement row for one order.
const withEngagement = async (client, orderId) => {
  await client.query(MIGRATION);
  const { rows } = await client.query(
    `SELECT id FROM refiners.orders WHERE order_id = $1`,
    [orderId]
  );
  assert.ok(rows[0], `the backfill made no engagement for order ${orderId}`);
  return rows[0].id;
};

test("the mirror invariant: one engagement per order, items matched, spots covered", async () => {
  await inPinnedTransaction(async (client) => {
    await client.query(MIGRATION);
    const { rows } = await client.query(`SELECT
      (SELECT count(*) FROM orders.orders)::int oo,
      (SELECT count(*) FROM refiners.orders)::int ro,
      (SELECT count(*) FROM orders.items)::int oi,
      (SELECT count(*) FROM refiners.items)::int ri,
      (SELECT count(*) FROM orders.spots os
        WHERE NOT EXISTS (SELECT 1 FROM refiners.spots rs
                           WHERE rs.order_id = os.order_id
                             AND rs.metal_id = os.metal_id))::int spots_uncovered,
      (SELECT count(*) FROM refiners.items WHERE refiner_order_id IS NULL)::int items_unlinked,
      (SELECT count(*) FROM refiners.spots WHERE refiner_order_id IS NULL)::int spots_unlinked`);
    const c = rows[0];
    assert.equal(c.oo, c.ro, `${c.oo} orders but ${c.ro} engagements`);
    assert.equal(c.oi, c.ri, `${c.oi} customer lines but ${c.ri} refiner lines`);
    // Spots CANNOT equal by addition - unlocking clears the customer rows
    // while the refiner's stay - so the pinned invariant is coverage: no
    // customer spot without its refiner counterpart, and every refiner row
    // linked to its engagement.
    assert.equal(c.spots_uncovered, 0, "a customer spot has no refiner counterpart");
    assert.equal(c.items_unlinked, 0, "a refiner line is not linked to an engagement");
    assert.equal(c.spots_unlinked, 0, "a refiner spot is not linked to an engagement");
  }, { lock: ORDER_LOCK });
});

test("the engagement PATCH writes the refiner's spot for that metal on that order", async () => {
  await inPinnedTransaction(async (client) => {
    const engagementId = await withEngagement(client, refinerMetal.purchase_order_id);
    await as({ ...admin, role: "admin" }, async () => {
      const res = await request(app)
        .patch(`/api/refiners/orders/${engagementId}`)
        .send({ spots: [{ name: refinerMetal.type, bid: 1234.56 }] });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const { rows } = await client.query(
        `SELECT bid_spot FROM exchange.refiner_metals
          WHERE purchase_order_id = $1 AND type = $2`,
        [refinerMetal.purchase_order_id, refinerMetal.type]
      );
      assert.ok(rows.length, "no refiner_metals row matched");
      assert.equal(Number(rows[0].bid_spot), 1234.56, "bid_spot did not change");
    });
  }, { lock: ORDER_LOCK });
});

test("the engagement PATCH lands pool and fee on the engagement AND the exchange shadow", async () => {
  await inPinnedTransaction(async (client) => {
    const engagementId = await withEngagement(client, refinerMetal.purchase_order_id);
    await as({ ...admin, role: "admin" }, async () => {
      const res = await request(app)
        .patch(`/api/refiners/orders/${engagementId}`)
        .send({ pool_oz_deducted: 1.2345, pool_remediation: 34.56, fee: 23.45 });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const engagement = (
        await client.query(
          `SELECT pool_oz_deducted, pool_remediation, fee FROM refiners.orders WHERE id = $1`,
          [engagementId]
        )
      ).rows[0];
      assert.equal(Number(engagement.pool_oz_deducted), 1.2345);
      assert.equal(Number(engagement.pool_remediation), 34.56);
      assert.equal(Number(engagement.fee), 23.45);

      // The shadow stays level: the existing services still write exchange.
      const shadow = (
        await client.query(
          `SELECT pool_oz_deducted, pool_remediation, refiner_fee
             FROM exchange.purchase_orders WHERE id = $1`,
          [refinerMetal.purchase_order_id]
        )
      ).rows[0];
      assert.equal(Number(shadow.pool_oz_deducted), 1.2345, "exchange lost the pool ounces");
      assert.equal(Number(shadow.pool_remediation), 34.56, "exchange lost the remediation");
      assert.equal(Number(shadow.refiner_fee), 23.45, "exchange lost the fee");
    });
  }, { lock: ORDER_LOCK });
});

test("the item PATCH writes the refiner premium on that line", async () => {
  await inPinnedTransaction(async (client) => {
    await as({ ...admin, role: "admin" }, async () => {
      const res = await request(app)
        .patch(`/api/refiners/items/by-order-item/${scrapItem.id}`)
        .send({ premium: 0.875 });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const { rows } = await client.query(
        `SELECT refiner_premium FROM exchange.purchase_order_items WHERE id = $1`,
        [scrapItem.id]
      );
      assert.equal(Number(rows[0].refiner_premium), 0.875, "refiner_premium did not change");
    });
  }, { lock: ORDER_LOCK });
});

test("the item PATCH writes the assay report to the actual columns", async () => {
  await inPinnedTransaction(async (client) => {
    await as({ ...admin, role: "admin" }, async () => {
      const res = await request(app)
        .patch(`/api/refiners/items/by-order-item/${scrapItem.id}`)
        .send({ purity: 0.9, post_melt: 3.0 });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const { rows } = await client.query(
        `SELECT purity_actual, post_melt_actual, content_actual, purity, pre_melt
           FROM exchange.scrap WHERE id = $1`,
        [scrapItem.scrap_id]
      );
      assert.equal(Number(rows[0].purity_actual), 0.9, "purity_actual did not land");
      assert.equal(Number(rows[0].post_melt_actual), 3.0, "post_melt_actual did not land");
      // content_actual is DERIVED by the same service the drawer always used.
      assert.ok(rows[0].content_actual !== null, "content_actual was not derived");
    });
  }, { lock: ORDER_LOCK });
});

// The poisoned-body rule on both endpoints: refused by name, nothing written.
// `content` gets its own message - it is derived, and silently recomputing
// over a sent value is the admin-mutation-urls bug.
test("poisoned bodies refuse by name on both refiners endpoints", async () => {
  await inPinnedTransaction(async (client) => {
    const engagementId = await withEngagement(client, refinerMetal.purchase_order_id);
    await as({ ...admin, role: "admin" }, async () => {
      const item = await request(app)
        .patch(`/api/refiners/items/by-order-item/${scrapItem.id}`)
        .send({ premium: 0.9, order_spots: [] });
      assert.equal(item.status, 400, `answered ${item.status}`);
      assert.match(item.body?.error?.message ?? "", /"order_spots"/);

      const derived = await request(app)
        .patch(`/api/refiners/items/by-order-item/${scrapItem.id}`)
        .send({ content: 1.5 });
      assert.equal(derived.status, 400, `answered ${derived.status}`);
      assert.match(derived.body?.error?.message ?? "", /"content" is derived/);

      const engagement = await request(app)
        .patch(`/api/refiners/orders/${engagementId}`)
        .send({ total_price: 100000 });
      assert.equal(engagement.status, 400, `answered ${engagement.status}`);
      assert.match(engagement.body?.error?.message ?? "", /"total_price"/);

      const { rows } = await client.query(
        `SELECT refiner_premium FROM exchange.purchase_order_items WHERE id = $1`,
        [scrapItem.id]
      );
      assert.notEqual(Number(rows[0].refiner_premium), 0.9, "a refused document still wrote");
    });
  }, { lock: ORDER_LOCK });
});

test("both refiners endpoints refuse a customer and an anonymous caller", async () => {
  await inPinnedTransaction(async (client) => {
    const engagementId = await withEngagement(client, refinerMetal.purchase_order_id);
    for (const [who, run] of [
      ["customer", (fn) => as({ ...customer, role: "user" }, fn)],
      ["anonymous", (fn) => anonymous(fn)],
    ]) {
      await run(async () => {
        const item = await request(app)
          .patch(`/api/refiners/items/by-order-item/${scrapItem.id}`)
          .send({ premium: 0.5 });
        assert.ok([401, 403].includes(item.status), `${who} was answered ${item.status}`);

        const engagement = await request(app)
          .patch(`/api/refiners/orders/${engagementId}`)
          .send({ fee: 1 });
        assert.ok([401, 403].includes(engagement.status), `${who} was answered ${engagement.status}`);
      });
    }
  }, { lock: ORDER_LOCK });
});

// THE ONE ENDPOINT ALLOWED TO RETURN FULL BANK DETAILS - payout-keyed now:
// GET /payouts/:id/details replaced the order-keyed legacy route in the
// read-flip wave, and the radioactive rule is unchanged.
//
// NOTHING FROM THE BODY IS PRINTED OR INTERPOLATED INTO AN ASSERTION MESSAGE,
// including on failure. The assertions are on KEYS and on status.
test("GET /payouts/:id/details answers with the payout's fields", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...admin, role: "admin" }, async () => {
      const res = await request(app).get(`/api/payouts/${payoutId}/details`);

      assert.equal(res.status, 200, `the details read answered ${res.status}`);

      const payout = Array.isArray(res.body) ? res.body[0] : res.body;
      assert.ok(payout && typeof payout === "object", "no payout object came back");

      // Key presence only. Never the values.
      for (const key of ["method", "account_holder_name"]) {
        assert.ok(key in payout, `the payout is missing ${key}`);
      }
    });
  });
});

test("a customer cannot read a payout's bank details", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...customer, role: "user" }, async () => {
      const res = await request(app).get(`/api/payouts/${payoutId}/details`);

      assert.ok(
        [401, 403].includes(res.status),
        `a signed-in customer was answered ${res.status}`
      );
    });
  });
});

test("an anonymous caller cannot read a payout's bank details", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app).get(`/api/payouts/${payoutId}/details`);

      assert.ok(
        [401, 403].includes(res.status),
        `an anonymous caller was answered ${res.status}`
      );
    });
  });
});
