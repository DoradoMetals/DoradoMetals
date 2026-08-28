// POST /quotes/order, over real HTTP.
//
// The order quote prices an EXISTING purchase order - the drawers' estimate
// the frontend's purchaseOrderTotal family used to compute client-side. What
// this file pins:
//
//   - ownership: the owner and an admin get an answer, a stranger gets 403,
//     an anonymous caller 401 - actors built the way ownership.test.js
//     builds its (a real owner row, a real stranger row, the stranger
//     re-badged admin).
//   - stored-vs-estimate: a line with a frozen item.price is returned
//     verbatim and flagged "stored"; an unpriced line is estimated from the
//     same tables the endpoint reads, hand-computed here.
//   - locked spots: a pinned order_metals.bid_spot prices the estimate, a
//     cleared one falls back to the live spot - the acceptOrder choice
//     (spots_locked ? order_spots : spot_prices) as the drawers displayed it.
//   - the $26.81 pin: a body riding spots, prices or a whole order object in
//     changes nothing.
//
// Everything runs inside the pin; the locked-spots test WRITES (price to
// NULL, the pin into order_metals) and the rollback discards it.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";
import { LOCKS } from "#shared/testing/locks.ts";

await mockSessions();
const { default: app } = await import("#app");

// This file writes order rows (inside the pin), so it takes the same lock the
// other order suites take.
const ORDER_LOCK = LOCKS.ORDERS;

const EXACT = 1e-9; // same floats, same tables, same order of operations

let order;    // the OLDEST owned purchase order with items - the stable fixture
let owner;    // its customer
let stranger; // a different non-admin user
let items;    // the order's item rows with the facts each side of the estimate reads
let orderMetals; // the order's frozen spots (bid_spot NULL when not locked)
let liveMetals;  // exchange.metals - what getPricingSpots serves under the default source
let payoutCost;
let shippingCharge;

// The premium chains the estimates mirror - getPurchaseOrderBullionPrice's
// and getPurchaseOrderScrapPrice's, restated for the hand-check.
const productPremium = (i) => Number(i.premium ?? i.product_bid_premium ?? 0);
const scrapPremium = (i) => Number(i.premium ?? i.scrap_bid_premium ?? 1);

function bidFor(metal) {
  const pinned = orderMetals.find((m) => m.type === metal)?.bid_spot;
  if (pinned != null) return Number(pinned);
  const live = liveMetals.find((m) => m.type === metal)?.bid_spot;
  return live == null ? 0 : Number(live);
}

before(async () => {
  // The OLDEST order with an owner and at least one typed item, for the same
  // reason ownership.test.js picks the oldest: nothing creates rows older
  // than the ones dev already has, so this picks the same order every time,
  // in isolation and in the full suite.
  const orders = await outside(
    `SELECT po.id, po.user_id
       FROM exchange.purchase_orders po
      WHERE po.user_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM exchange.purchase_order_items poi
           WHERE poi.purchase_order_id = po.id
             AND (poi.scrap_id IS NOT NULL OR poi.product_id IS NOT NULL)
        )
      ORDER BY po.created_at ASC, po.id ASC LIMIT 1`
  );
  order = orders[0];
  assert.ok(order, "dev has no owned purchase order with items - every check here would be vacuous");

  const owners = await outside(`SELECT id, name, email FROM exchange.users WHERE id = $1`, [
    order.user_id,
  ]);
  owner = { ...owners[0], role: "user" };
  assert.ok(owner.id, `no exchange.users row for ${order.user_id}, the owner of order ${order.id}`);

  const others = await outside(
    `SELECT id, name, email FROM exchange.users
      WHERE id <> $1 AND role IS DISTINCT FROM 'admin' LIMIT 1`,
    [order.user_id]
  );
  stranger = { ...others[0], role: "user" };
  assert.ok(stranger?.id, "dev has only one non-admin user, so ownership cannot be tested");

  // The facts each side of the estimate reads, straight from the tables the
  // endpoint reads them from.
  items = await outside(
    `SELECT poi.id, poi.price, poi.quantity, poi.premium,
            CASE WHEN poi.scrap_id IS NOT NULL THEN 'scrap'
                 WHEN poi.product_id IS NOT NULL THEN 'product'
                 ELSE 'unknown' END AS kind,
            s.content       AS scrap_content,
            ms.type         AS scrap_metal,
            s.bid_premium   AS scrap_bid_premium,
            p.content       AS product_content,
            mp.type         AS product_metal,
            p.bid_premium   AS product_bid_premium
       FROM exchange.purchase_order_items poi
       LEFT JOIN exchange.scrap s ON s.id = poi.scrap_id
       LEFT JOIN exchange.metals ms ON ms.id = s.metal_id
       LEFT JOIN exchange.products p ON p.id = poi.product_id
       LEFT JOIN exchange.metals mp ON mp.id = p.metal_id
      WHERE poi.purchase_order_id = $1`,
    [order.id]
  );

  orderMetals = await outside(
    `SELECT type, bid_spot FROM exchange.order_metals WHERE purchase_order_id = $1`,
    [order.id]
  );
  // The live pricing spots. Spots is restructured - one implementation,
  // reading spots.spots - so this reads the same table getPricingSpots does,
  // the way the sibling replay tests do. exchange.metals drifts from it in
  // dev and would hand-compute a different estimate.
  liveMetals = await outside(
    `SELECT m.name AS type, s.bid AS bid_spot
       FROM spots.spots s JOIN metals.metals m ON m.id = s.metal_id`
  );

  const payouts = await outside(`SELECT cost FROM exchange.payouts WHERE order_id = $1`, [order.id]);
  payoutCost = Number(payouts[0]?.cost ?? 0);
  const shipments = await outside(
    `SELECT net_charge FROM exchange.shipments WHERE purchase_order_id = $1 AND type = 'Inbound'`,
    [order.id]
  );
  shippingCharge = Number(shipments[0]?.net_charge ?? 0);
});

after(async () => {
  restoreSessions();
  await pool.end();
});

// ---------------------------------------------------------------- ownership

test("the order quote is the owner's and the admins', and nobody else's", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app).post("/api/quotes/order").send({ order_id: order.id });
      assert.equal(res.status, 401, `answered ${res.status} with no session`);
    });

    await as(stranger, async () => {
      const res = await request(app).post("/api/quotes/order").send({ order_id: order.id });
      assert.equal(res.status, 403, `answered ${res.status} with somebody else's estimate`);
    });

    await as(owner, async () => {
      const res = await request(app).post("/api/quotes/order").send({ order_id: order.id });
      assert.equal(res.status, 200, `the owner was answered ${res.status}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.order_id, order.id);

      // A body naming no order is refused by the guard, not waved through.
      const unnamed = await request(app).post("/api/quotes/order").send({});
      assert.equal(unnamed.status, 400, `an unnamed order answered ${unnamed.status}`);
    });

    // The stranger's own row, re-badged: admins administer every order.
    await as({ ...stranger, role: "admin" }, async () => {
      const res = await request(app).post("/api/quotes/order").send({ order_id: order.id });
      assert.equal(res.status, 200, `an admin was answered ${res.status}: ${JSON.stringify(res.body)}`);
    });
  }, { lock: ORDER_LOCK });
});

// ---------------------------------------------------- stored versus estimate

test("stored prices come back verbatim and estimates come from the tables", async () => {
  await inPinnedTransaction(async () => {
    await as(owner, async () => {
      const res = await request(app).post("/api/quotes/order").send({ order_id: order.id });
      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const typed = items.filter((i) => i.kind !== "unknown");
      assert.equal(
        res.body.items.length,
        typed.length,
        "the quote does not carry one line per typed item"
      );

      let scrapTotal = 0;
      let bullionTotal = 0;
      for (const db of typed) {
        const line = res.body.items.find((l) => l.id === db.id);
        assert.ok(line, `item ${db.id} is missing from the quote`);
        assert.equal(line.kind, db.kind);

        if (db.price != null) {
          assert.equal(line.source, "stored", `priced item ${db.id} not flagged stored`);
          assert.ok(Math.abs(line.unit_price - Number(db.price)) < EXACT,
            `stored unit_price ${line.unit_price} != the frozen ${db.price}`);
        } else {
          assert.equal(line.source, "estimate", `unpriced item ${db.id} not flagged estimate`);
          const expected =
            db.kind === "product"
              ? Number(db.product_content ?? 0) * (bidFor(db.product_metal) * productPremium(db))
              : Number(db.scrap_content ?? 0) * (bidFor(db.scrap_metal) * scrapPremium(db));
          assert.ok(Math.abs(line.unit_price - expected) < EXACT,
            `estimated unit_price ${line.unit_price} != hand-computed ${expected} for ${db.kind} ${db.id}`);
        }

        // Products multiply by quantity; scrap content already covers the line.
        const expectedLine =
          db.kind === "product"
            ? line.unit_price * Number(db.quantity ?? 1)
            : line.unit_price;
        assert.ok(Math.abs(line.line_total - expectedLine) < EXACT,
          `line_total ${line.line_total} != ${expectedLine} for ${db.kind} ${db.id}`);

        if (db.kind === "product") bullionTotal += line.line_total;
        else scrapTotal += line.line_total;
      }

      assert.ok(Math.abs(res.body.scrap_total - scrapTotal) < EXACT, "scrap_total is not the sum of its lines");
      assert.ok(Math.abs(res.body.bullion_total - bullionTotal) < EXACT, "bullion_total is not the sum of its lines");
      // purchaseOrderTotal's bottom line: items minus shipping minus payout.
      assert.ok(
        Math.abs(res.body.total - (scrapTotal + bullionTotal - shippingCharge - payoutCost)) < EXACT,
        `total ${res.body.total} != items ${scrapTotal + bullionTotal} - shipping ${shippingCharge} - payout ${payoutCost}`
      );
    });
  }, { lock: ORDER_LOCK });
});

// ------------------------------------------------------------- locked spots

test("a locked order estimates at its locked spots, an unlocked one at live", async () => {
  // An item to force into the estimate path, whose metal has a live spot -
  // without one the fallback leg of the check would compare 0 to 0.
  const target = items.find((i) => {
    const metal = i.kind === "product" ? i.product_metal : i.kind === "scrap" ? i.scrap_metal : null;
    return metal != null && liveMetals.some((m) => m.type === metal && m.bid_spot != null);
  });
  assert.ok(target, "no item on the fixture order has a metal with a live spot");
  const metal = target.kind === "product" ? target.product_metal : target.scrap_metal;
  const content = Number(
    (target.kind === "product" ? target.product_content : target.scrap_content) ?? 0
  );
  const premium = target.kind === "product" ? productPremium(target) : scrapPremium(target);
  const liveBid = Number(liveMetals.find((m) => m.type === metal).bid_spot);

  await inPinnedTransaction(async (client) => {
    // BOTH SCHEMAS, because the read this endpoint sits on follows
    // PURCHASE_ORDERS_SOURCE: dev runs dual (reads the orders schema) and the
    // default is exchange, and a fixture written to only one of them makes
    // this test assert against whichever the env happens to say. All of it
    // rolls back with the transaction.
    await client.query(`UPDATE exchange.purchase_order_items SET price = NULL WHERE id = $1`, [
      target.id,
    ]);
    await client.query(`UPDATE orders.items SET price = NULL WHERE id = $1`, [target.id]);

    // The oldest dev order predates frozen-spot rows entirely, so the pin is
    // an upsert in each schema: update the frozen row if the order has one,
    // create it if not - exactly the row lockSpots would have written.
    const updated = await client.query(
      `UPDATE exchange.order_metals SET bid_spot = $1
        WHERE purchase_order_id = $2 AND type = $3 RETURNING id`,
      [1234.56, order.id, metal]
    );
    if (updated.rows.length === 0) {
      await client.query(
        `INSERT INTO exchange.order_metals (purchase_order_id, type, bid_spot)
         VALUES ($1, $2, $3)`,
        [order.id, metal, 1234.56]
      );
    }
    const updatedNext = await client.query(
      `UPDATE orders.spots SET bid = $1
        WHERE order_id = $2 AND metal_id = (SELECT id FROM metals.metals WHERE name = $3)
        RETURNING id`,
      [1234.56, order.id, metal]
    );
    if (updatedNext.rows.length === 0) {
      await client.query(
        `INSERT INTO orders.spots (order_id, metal_id, bid)
         VALUES ($1, (SELECT id FROM metals.metals WHERE name = $2), $3)`,
        [order.id, metal, 1234.56]
      );
    }

    await client.query(`UPDATE exchange.purchase_orders SET spots_locked = TRUE WHERE id = $1`, [
      order.id,
    ]);
    await client.query(`UPDATE orders.orders SET spots_locked = TRUE WHERE id = $1`, [order.id]);

    await as(owner, async () => {
      const locked = await request(app).post("/api/quotes/order").send({ order_id: order.id });
      assert.equal(locked.status, 200, `answered ${locked.status}: ${JSON.stringify(locked.body)}`);
      const lockedLine = locked.body.items.find((l) => l.id === target.id);
      assert.equal(lockedLine.source, "estimate");
      const atPin = content * (1234.56 * premium);
      assert.ok(Math.abs(lockedLine.unit_price - atPin) < EXACT,
        `locked estimate ${lockedLine.unit_price} != ${atPin} at the pinned spot`);

      // Unlock the way unlockSpots does - flag off, frozen bids cleared -
      // and the same line prices at the live spot.
      await client.query(`UPDATE exchange.purchase_orders SET spots_locked = FALSE WHERE id = $1`, [
        order.id,
      ]);
      await client.query(`UPDATE orders.orders SET spots_locked = FALSE WHERE id = $1`, [order.id]);
      await client.query(
        `UPDATE exchange.order_metals SET bid_spot = NULL WHERE purchase_order_id = $1`,
        [order.id]
      );
      await client.query(`UPDATE orders.spots SET bid = NULL WHERE order_id = $1`, [order.id]);

      const unlocked = await request(app).post("/api/quotes/order").send({ order_id: order.id });
      assert.equal(unlocked.status, 200);
      const unlockedLine = unlocked.body.items.find((l) => l.id === target.id);
      const atLive = content * (liveBid * premium);
      assert.ok(Math.abs(unlockedLine.unit_price - atLive) < EXACT,
        `unlocked estimate ${unlockedLine.unit_price} != ${atLive} at the live spot`);
    });
  }, { lock: ORDER_LOCK });
});

// ------------------------------------------------- the $26.81 regression pin

test("no body-supplied price, spot or order object is ever honoured", async () => {
  await inPinnedTransaction(async () => {
    await as(owner, async () => {
      const clean = await request(app).post("/api/quotes/order").send({ order_id: order.id });
      assert.equal(clean.status, 200);

      const poisoned = await request(app).post("/api/quotes/order").send({
        order_id: order.id,
        spots: [{ type: "Gold", name: "Gold", ask_spot: 1, bid_spot: 1, ask: 1, bid: 1 }],
        spot_prices: [{ type: "Gold", ask_spot: 1, bid_spot: 1 }],
        order_spots: [{ type: "Gold", bid_spot: 1 }],
        ask_spot: 1,
        bid_spot: 1,
        price: 0.01,
        total: 0.01,
        items: [{ id: order.id, price: 0.01 }],
        // A whole order riding along, its id matching so the ownership guard
        // resolves the same order either way - and every field of it ignored.
        order: { id: order.id, total_price: 0.01, order_items: [] },
      });
      assert.equal(poisoned.status, 200);

      const stripTimestamp = ({ spots_at, ...rest }) => rest;
      assert.deepEqual(stripTimestamp(poisoned.body), stripTimestamp(clean.body),
        "the order quote read something price-shaped off the body");
    });
  }, { lock: ORDER_LOCK });
});
