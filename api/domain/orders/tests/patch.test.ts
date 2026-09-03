// PATCH /api/orders/:id AND THE FOUR ACTION ROUTES (D214 item 11).
//
// THE MULTIPLEXED DOCUMENT IS GONE. This endpoint carried four ACTIONS as body
// flags - add_funds, finalize_pricing, cancel, supplier - which is why it
// needed a dispatcher, a direction matrix, four bespoke refusal messages and a
// documented rule about which field ran last. Each is its own POST now
// (docs/waves/rest-routes.md), and what is left here is a PATCH of the order
// row's own columns: `status` and `notes`.
//
// The dispatch of each family is covered where it always was: replay.test.js
// (labels, the spots sub-resource), item-edits and offer-and-items (lines),
// money-edits (shipments and payouts), add-funds (the credit),
// accept-offer-pricing (server-side pricing), refiner-edits (the engagement),
// sales-orders/patch.test.js (the supplier guard stack). This file owns what
// is NEW with the unification: what the document may say, that direction is
// DATA validated by the service, that a status is a label and never a
// pipeline, and that a combined document behaves like sequential clicks.
//
// THE WHOLE SURFACE IS requireAdmin (Jacob, 28 August): customers have no
// order-management surface - the old owner cancel was never wired client-side
// - so every non-admin caller is refused outright, their own order included.
//
// THE CANCEL PIPELINE CANNOT ANSWER 200 HERE. Its first act buys a real FedEx
// return label, and the provider refuses the live API during a test run
// (providers/shipments/endpoints.ts) - the same reason replay.test.js has
// never driven cancel_order. What CAN be proven over HTTP is the half that
// matters: the cancel document is not refused - it reaches the pipeline,
// whose label guard turns it into a 500 - and the order is NOT cancelled by
// the failed attempt, which is the pipeline's own no-label-no-cancellation
// ordering.
//
// NOTHING IS COMMITTED - the pool is pinned to a rolled-back transaction.
import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, asAdmin, asUser } from "#shared/testing/session.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";
import {
  aUser, anAddress, aProduct, anOrder, aRefinerEngagement, aPayout,
  carrierServiceId, packageId,
} from "#shared/testing/builders/index.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import type { PoolClient } from "pg";

const ORDER_LOCK = LOCKS.ORDERS;

await mockSessions();
const { default: app } = await import("#app");

// THE STRUCTURAL SUBSET EACH FIXTURE ACTUALLY HAS. These are SELECT
// projections, not table rows - naming a row type would claim columns the
// query never asked for.
type UserFixture = { id: string; name: string | null; email: string | null };
type OrderFixture = { id: string; user_id: string; status: string };

const admin: UserFixture = TEST_ACTOR;

// THE ORDER AND ITS OWNER ARE BUILT (lane 1). This took "the OLDEST qualifying
// order, for the reason ownership.test.js records: the newest is a race against
// every file that creates one" - a five-clause WHERE hunting a purchase order
// that had items AND spots AND a payout fee AND was still open, then looked its
// owner up in the frozen exchange.users table with a guard for the row not
// being there. Every one of those clauses is now a builder call, so the order
// has what the tests need because they asked for it.
const anOpenPurchaseOrder = async (c: PoolClient) => {
  const owner = await aUser(c, { name: "The Customer" });
  const address = await anAddress(c, owner);
  const product = await aProduct(c);
  const built = await anOrder(c, owner, { direction: "purchase", status: "Pending" })
    .withBullion(product, 1)
    .withLots(1, { metal: "Gold" })
    .withSpots()
    .withAddress(address)
    .withTotals({ total: 1000, payout_fee: 0 });
  await aRefinerEngagement(c, built);
  await aPayout(c, owner, { order: built });
  return {
    order: { id: built.id, user_id: owner.id, status: "Pending" },
    owner,
  };
};

// The same order WITHOUT its address snapshot - the cancel refuses before the
// carrier is called, which used to need an "address-less purchase order" found
// on dev with a NOT EXISTS.
const anAddresslessPurchaseOrder = async (c: PoolClient) => {
  const owner = await aUser(c);
  const built = await anOrder(c, owner, { direction: "purchase", status: "Pending" })
    .withLots(1)
    .withSpots()
    .withTotals({ total: 1000 });
  return { id: built.id };
};

// The two seeded reference rows the cancel document names.
const label = async (c: PoolClient) => ({
  service: { id: await carrierServiceId(c, "Express Saver") },
  box: { id: await packageId(c, "Small Box") },
});

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

// ------------------------------------------------------------- the document

// THE BODY IS PARSED STRICTLY AT TRANSPORT (D214 item 11), so the service's
// own `refusedField` is gone with the dispatcher it fed. What used to be a
// unit test of that function is an HTTP test of the contract: the schema is
// `OrdersRow.pick({status, notes}).partial().strict()`, so a field the
// endpoint does not have is a 400 naming it - never a silent drop.
test("the PATCH takes the order row's own fields, and refuses everything else", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { order } = await anOpenPurchaseOrder(c);
    await asAdmin(admin, async () => {
      // THE FOUR RETIRED ACTIONS refuse by name. Each is a POST of its own now.
      for (const named of ["add_funds", "finalize_pricing", "cancel", "supplier"]) {
        const res = await request(app)
          .patch(`/api/orders/${order.id}`)
          .send({ [named]: true });
        assert.equal(res.status, 400, `${named} was not refused`);
        assert.match(
          res.body?.error?.message ?? "",
          new RegExp(named),
          `the refusal does not name ${named}`
        );
      }

      // And so does every grab-bag field that moved to its own resource.
      for (const named of ["order_spots", "purchase_order", "spots", "items", "charges",
        "pool_oz_deducted", "tracking", "refiner"]) {
        const res = await request(app)
          .patch(`/api/orders/${order.id}`)
          .send({ [named]: 1 });
        assert.equal(res.status, 400, `${named} was not refused`);
        assert.match(res.body?.error?.message ?? "", new RegExp(named));
      }

      // A document naming nothing is a refusal too - a no-op that reports
      // success is worse than a refusal.
      const empty = await request(app).patch(`/api/orders/${order.id}`).send({});
      assert.equal(empty.status, 422, `answered ${empty.status}`);
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

// DIRECTION IS DATA, AND THE USE CASE ASKS IT. The matrix that lived in the
// PATCH body's field table is one `rules.assertDirection` call per action now,
// so a purchase-only action on a sale order refuses naming both.
test("an action of the wrong direction is refused, naming the direction", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { order } = await anOpenPurchaseOrder(c);
    const sale = await anOrder(c, await aUser(c), { direction: "sale" }).withLots(1);
    await asAdmin(admin, async () => {
      const res = await request(app).post(`/api/orders/${sale.id}/finalize_pricing`).send({});
      assert.equal(res.status, 422, `answered ${res.status}`);
      assert.match(
        res.body?.error?.message ?? "",
        /purchase-direction operation and this is a sale order/
      );

      const refiner = await request(app)
        .post(`/api/orders/${order.id}/send_to_refiner`)
        .send({ refiner_id: "00000000-0000-4000-8000-000000000000" });
      assert.equal(refiner.status, 422, `answered ${refiner.status}`);
      assert.match(
        refiner.body?.error?.message ?? "",
        /sale-direction operation and this is a purchase order/
      );
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

// --------------------------------------------------------------- the guard

test("a customer is refused outright, their own order included", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    const { order, owner } = await anOpenPurchaseOrder(client);
    await asUser(owner, async () => {
      const before = (
        await client.query(
          `SELECT o.status, t.total FROM orders.orders o
             JOIN orders.transactions t ON t.order_id = o.id WHERE o.id = $1`,
          [order.id]
        )
      ).rows[0];

      const label = await request(app)
        .patch(`/api/orders/${order.id}`)
        .send({ status: "Completed" });
      assert.equal(label.status, 403, "the owner reached the status label");

      for (const action of ["add_funds", "finalize_pricing", "cancel", "send_to_refiner"]) {
        const res = await request(app).post(`/api/orders/${order.id}/${action}`).send({});
        assert.equal(res.status, 403, `the owner reached ${action}`);
      }
      const spots = await request(app).put(`/api/orders/${order.id}/spots`).send({ lock: true });
      assert.equal(spots.status, 403, "the owner reached the spots PUT");
      const item = await request(app)
        .post(`/api/orders/${order.id}/items`)
        .send({ bullion_id: "00000000-0000-4000-8000-000000000000" });
      assert.equal(item.status, 403, "the owner reached line creation");

      const after = (
        await client.query(
          `SELECT o.status, t.total FROM orders.orders o
             JOIN orders.transactions t ON t.order_id = o.id WHERE o.id = $1`,
          [order.id]
        )
      ).rows[0];
      assert.deepEqual(after, before, "a refused caller still wrote");
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

// ------------------------------------------------- status is a label, only

test("a status write moves the label and NOTHING else", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    const { order } = await anOpenPurchaseOrder(client);
    await asAdmin(admin, async () => {
      const moneyBefore = (
        await client.query(
          `SELECT t.total, o.spots_locked FROM orders.orders o
             JOIN orders.transactions t ON t.order_id = o.id WHERE o.id = $1`,
          [order.id]
        )
      ).rows[0];
      const pricesBefore = (
        await client.query(
          `SELECT id, price FROM orders.items
            WHERE order_id = $1 ORDER BY id`,
          [order.id]
        )
      ).rows;

      const res = await request(app)
        .patch(`/api/orders/${order.id}`)
        .send({ status: "Payment Processing" });
      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const row = (
        await client.query(
          `SELECT o.status, t.total, o.spots_locked, o.updated_by
             FROM orders.orders o
             JOIN orders.transactions t ON t.order_id = o.id WHERE o.id = $1`,
          [order.id]
        )
      ).rows[0];
      assert.equal(row.status, "Payment Processing");
      assert.equal(row.updated_by, admin.name, "the audit name did not come from the session");

      // The ruling itself: no pricing side effects, whatever the label.
      assert.deepEqual(
        { total: row.total, spots_locked: row.spots_locked },
        moneyBefore,
        "a bare status write moved money or the spot pin"
      );
      const pricesAfter = (
        await client.query(
          `SELECT id, price FROM orders.items
            WHERE order_id = $1 ORDER BY id`,
          [order.id]
        )
      ).rows;
      assert.deepEqual(pricesAfter, pricesBefore, "a bare status write re-priced the lines");
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

// ------------------------------------------------------- the cancel action

// POST /api/orders/:id/cancel, four fields: the box, the service, what to
// insure and what it weighs. It took the admin drawer's WHOLE form as
// `Record<string, any>` and hand-mapped fifteen values out of it; where the
// parcel goes is the order's own address snapshot and who signs for the
// business is the provider's configured contact.
test("the cancel action reaches the label pipeline and a label failure cancels nothing", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    const { service, box } = await label(client);
    // AN ORDER WITH AN ADDRESS SNAPSHOT: where the metal goes back TO is the
    // order's own, so an order without one refuses before the carrier is
    // called - the case the next test owns.
    const { order: returnable } = await anOpenPurchaseOrder(client);
    await asAdmin(admin, async () => {
      const res = await request(app)
        .post(`/api/orders/${returnable.id}/cancel`)
        .send({
          carrier_service_id: service.id,
          package_id: box.id,
          declared_value: 1000,
          weight: 3,
        });

      // NOT a refusal: the document is sound and the pipeline began. What
      // answers is the FedEx live-API guard - the first act of the cancel is
      // the label, refused during a test run - which is a 500, never a 4xx.
      assert.equal(
        res.status,
        500,
        `expected the label guard's 500, got ${res.status}: ${JSON.stringify(res.body)}`
      );

      const { rows } = await client.query(
        `SELECT status FROM orders.orders WHERE id = $1`,
        [returnable.id]
      );
      assert.notEqual(rows[0].status, "Cancelled");
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

// WHERE THE METAL GOES BACK TO IS THE ORDER'S OWN SNAPSHOT, and an order that
// never took one cannot be cancelled at all. The drawer used to supply the
// address in the body, so this order would have shipped to whatever it said.
test("an order with no address snapshot refuses the cancel before the carrier", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { service, box } = await label(c);
    const orphan = await anAddresslessPurchaseOrder(c);
    await asAdmin(admin, async () => {
      const res = await request(app)
        .post(`/api/orders/${orphan.id}/cancel`)
        .send({
          carrier_service_id: service.id,
          package_id: box.id,
          declared_value: 1000,
          weight: 3,
        });
      assert.equal(res.status, 422, `answered ${res.status}`);
      assert.match(res.body?.error?.message ?? "", /no address snapshot/);
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

// ------------------------------------------------------------ the refusals

test("an unknown field is refused over HTTP and executes nothing beside it", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    const { order } = await anOpenPurchaseOrder(client);
    await asAdmin(admin, async () => {
      const before = (
        await client.query(
          `SELECT status FROM orders.orders WHERE id = $1`,
          [order.id]
        )
      ).rows[0];

      const res = await request(app)
        .patch(`/api/orders/${order.id}`)
        .send({ status: "Received", order_spots: [] });

      assert.equal(res.status, 400, `answered ${res.status}`);
      assert.match(res.body?.error?.message ?? "", /"order_spots"/);

      const after = (
        await client.query(
          `SELECT status FROM orders.orders WHERE id = $1`,
          [order.id]
        )
      ).rows[0];
      assert.deepEqual(after, before, "the valid half of a refused document was executed");
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

test("a nonexistent order answers 404 to an admin", async () => {
  await inPinnedTransaction(async () => {
    await asAdmin(admin, async () => {
      const res = await request(app)
        .patch("/api/orders/00000000-0000-4000-8000-000000000000")
        .send({ status: "Received" });
      assert.equal(res.status, 404, `answered ${res.status}`);
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

// -------------------------------------------------------------- the op order

// finalize + label in ONE document must leave the order exactly where
// finalize THEN label in two requests leaves it - the documented reason
// status runs last.
//
// The spots are pinned to sentinel values FIRST, inside the rolled-back
// transaction, so both scenarios price from the same numbers and the
// comparison cannot be raced by a live spot update - and so the resulting
// prices provably derive from values only the database ever held.
const PINNED_BIDS: Record<string, number> = { Gold: 2000, Silver: 25, Platinum: 900, Palladium: 800 };

const pinMetals = async (client: PoolClient) => {
  // The live feed is spots.spots (the exchange.metals read died with the dual
  // layer, D212), keyed by metal id.
  for (const [metal, bid] of Object.entries(PINNED_BIDS)) {
    await client.query(
      `UPDATE spots.spots SET bid = $1
        WHERE metal_id = (SELECT id FROM metals.metals WHERE name = $2)`,
      [bid, metal]
    );
  }
};

const snapshot = async (client: PoolClient, id: string) => ({
  order: (
    await client.query(
      `SELECT o.status, o.spots_locked, t.total
         FROM orders.orders o
         JOIN orders.transactions t ON t.order_id = o.id WHERE o.id = $1`,
      [id]
    )
  ).rows[0],
  metals: (
    await client.query(
      `SELECT m.name, sp.bid FROM orders.spots sp
         JOIN metals.metals m ON m.id = sp.metal_id
        WHERE sp.order_id = $1 ORDER BY m.name`,
      [id]
    )
  ).rows,
  items: (
    await client.query(
      `SELECT id, price FROM orders.items
        WHERE order_id = $1 ORDER BY id`,
      [id]
    )
  ).rows,
});

type Snapshot = Awaited<ReturnType<typeof snapshot>>;

// FINALIZING AND LABELLING ARE TWO REQUESTS NOW, and that is the whole change:
// the property this used to assert - that one combined document behaved like
// two sequential clicks - existed only because the body multiplexed them.
// What still has to hold is that each does its own job and nothing else.
test("finalizing prices the order and pins its spots; the label that follows moves nothing", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    const { order } = await anOpenPurchaseOrder(client);
    await pinMetals(client);
    await asAdmin(admin, async () => {
      const finalize = await request(app)
        .post(`/api/orders/${order.id}/finalize_pricing`)
        .send({});
      assert.equal(
        finalize.status, 200,
        `finalize answered ${finalize.status}: ${JSON.stringify(finalize.body)}`
      );
      const priced = await snapshot(client, order.id);
      assert.equal(priced.order.spots_locked, true, "finalizing did not pin the spots");
      assert.ok(priced.order.total !== null, "finalizing did not price the order");

      const label = await request(app)
        .patch(`/api/orders/${order.id}`)
        .send({ status: "Payment Processing" });
      assert.equal(label.status, 200, `label answered ${label.status}`);

      const after = await snapshot(client, order.id);
      assert.equal(after.order.status, "Payment Processing");
      assert.deepEqual(
        { total: after.order.total, spots_locked: after.order.spots_locked, items: after.items },
        { total: priced.order.total, spots_locked: priced.order.spots_locked, items: priced.items },
        "the label moved money or the spot pin"
      );
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

// `notes` is the other column this PATCH owns, and null CLEARS it - which is
// what `.partial()` over a nullable column means (shared/db/patch.ts).
test("notes is written and an explicit null clears it", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    const { order } = await anOpenPurchaseOrder(client);
    await asAdmin(admin, async () => {
      const written = await request(app)
        .patch(`/api/orders/${order.id}`)
        .send({ notes: "left on the porch" });
      assert.equal(written.status, 200, written.text);
      assert.equal(
        (await client.query(`SELECT notes FROM orders.orders WHERE id = $1`, [order.id]))
          .rows[0].notes,
        "left on the porch"
      );

      const cleared = await request(app)
        .patch(`/api/orders/${order.id}`)
        .send({ notes: null });
      assert.equal(cleared.status, 200, cleared.text);
      assert.equal(
        (await client.query(`SELECT notes FROM orders.orders WHERE id = $1`, [order.id]))
          .rows[0].notes,
        null
      );
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

test("nothing this file did survived the transactions", async () => {
  // THE ORDER'S OWN STATUS CHECK IS GONE, and its absence is stronger than it
  // was: the fixture is built inside each transaction now, so there is no
  // committed order for this file to have moved. What remains checkable from
  // outside is the pinned spot feed, below - and that no built order survived,
  // which shared/testing/builders/tests/builders.test.ts asserts directly with
  // assertNothingEscaped.
  // No PINNED sentinel escaped the rolled-back transactions. NOT an exact
  // snapshot comparison any more: the dev deployment's spot cron writes
  // exchange.metals continuously on this shared database, so exact equality
  // races the live feed whenever the suite runs slowly - it flaked exactly
  // that way on a slow run. What this file could actually leak is its four
  // pinned bids, so their absence is the assertion.
  const metalsNow = await outside<{ name: string; bid: string }>(
    `SELECT m.name, sp.bid FROM spots.spots sp
       JOIN metals.metals m ON m.id = sp.metal_id ORDER BY m.name`
  );
  for (const row of metalsNow) {
    assert.notEqual(
      Number(row.bid),
      PINNED_BIDS[row.name],
      `a pinned sentinel bid for ${row.name} escaped into spots.spots`
    );
  }
});
