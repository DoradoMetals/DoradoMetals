// PATCH /api/orders/:id - the unified document, the direction rule, the
// label/pipeline split, and one-document-equals-sequential-clicks.
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
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, asAdmin, asUser } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";
import { refusedField } from "#domain/orders/patch.ts";
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

let admin: UserFixture;
let order: OrderFixture; // an open purchase order with items, metals and a payout
let owner: UserFixture; // its customer

before(async () => {
  admin = (
    await outside<UserFixture>(`SELECT id, name, email FROM exchange.users WHERE role = 'admin' LIMIT 1`)
  )[0];
  assert.ok(admin, "dev has no admin user");

  // The OLDEST qualifying order, for the reason ownership.test.js records:
  // the newest is a race against every file that creates one.
  order = (
    await outside<OrderFixture>(
      `SELECT o.id, o.user_id, o.status
         FROM orders.orders o
         JOIN orders.transactions t ON t.order_id = o.id
        WHERE o.direction = 'purchase' AND o.user_id IS NOT NULL
          AND o.status NOT IN ('Cancelled', 'Completed')
          AND t.payout_fee IS NOT NULL
          AND EXISTS (SELECT 1 FROM orders.spots s WHERE s.order_id = o.id)
          AND EXISTS (SELECT 1 FROM orders.items i WHERE i.order_id = o.id)
        ORDER BY o.created_at ASC, o.id ASC LIMIT 1`
    )
  )[0];
  assert.ok(order, "dev has no open purchase order with items, metals and a payout");

  owner = (
    await outside<UserFixture>(`SELECT id, name, email FROM exchange.users WHERE id = $1`, [order.user_id])
  )[0];
  assert.ok(owner?.id, `no exchange.users row for ${order.user_id}`);

});

after(async () => {
  restoreSessions();
  await pool.end();
});

// ------------------------------------------------------------- the document

// Names the refusal rather than dereferencing a possible null.
const shapeRefusal = (direction: "purchase" | "sale", body: Record<string, unknown>): string => {
  const refusal = refusedField(direction, body);
  assert.ok(refusal, `${Object.keys(body)[0]} was accepted when its shape is wrong`);
  return refusal.message;
};

test("the document check, refusal by refusal, direction included", () => {
  // A sound purchase document and a sound sale document.
  assert.equal(
    refusedField("purchase", {
      add_funds: true,
      finalize_pricing: true,
      status: "Payment Processing",
    }),
    null
  );
  assert.equal(
    refusedField("sale", { supplier: { supplier_id: "x", send: true }, status: "Preparing" }),
    null
  );

  // A field the endpoint does not have is a 400, named - not dropped, which
  // was the admin-mutation-urls bug. The retired grab-bag fields are the best
  // examples: every one now lives on its own resource's endpoint.
  for (const named of ["order_spots", "purchase_order", "spots", "items", "charges",
    "pool_oz_deducted", "tracking", "refiner"]) {
    const refusal = refusedField("purchase", { [named]: 1 });
    assert.ok(refusal, `${named} was not refused at all`);
    assert.equal(refusal.statusCode, 400, `${named} was not refused`);
    assert.match(refusal.message, new RegExp(`"${named}"`), `the refusal does not name ${named}`);
  }

  // DIRECTION IS DATA: a wrong-direction field refuses naming both the field
  // and the direction it belongs to.
  const saleFinalize = refusedField("sale", { finalize_pricing: true });
  assert.ok(saleFinalize, "a purchase-only field was accepted on a sale order");
  assert.equal(saleFinalize.statusCode, 400);
  assert.match(saleFinalize.message, /"finalize_pricing".*purchase-direction/);
  const purchaseSupplier = refusedField("purchase", { supplier: { supplier_id: "x", send: true } });
  assert.ok(purchaseSupplier, "a sale-only field was accepted on a purchase order");
  assert.equal(purchaseSupplier.statusCode, 400);
  assert.match(purchaseSupplier.message, /"supplier".*sale-direction/);

  // The pipeline operations state their own shape.
  //
  // GUARDED, because refusedField returns `| null` and this file dereferenced
  // it five times without checking. A null here meant a TypeError naming
  // nothing rather than "the shape check did not fire", i.e. the test failed
  // confusingly instead of usefully. Surfaced by the TypeScript conversion.
  assert.match(shapeRefusal("purchase", { finalize_pricing: "yes" }), /"finalize_pricing"/);
  assert.match(shapeRefusal("purchase", { cancel: {} }), /"cancel"/);
  assert.match(
    shapeRefusal("sale", { supplier: { supplier_id: "x", send: false } }),
    /"supplier"/
  );
});

// --------------------------------------------------------------- the guard

test("a customer is refused outright, their own order included", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await asUser(owner, async () => {
      const before = (
        await client.query(
          `SELECT o.status, t.total FROM orders.orders o
             JOIN orders.transactions t ON t.order_id = o.id WHERE o.id = $1`,
          [order.id]
        )
      ).rows[0];

      for (const document of [
        { status: "Completed" },
        { finalize_pricing: true },
        { cancel: { return_shipment: {} } },
        { add_funds: true },
      ]) {
        const res = await request(app).patch(`/api/orders/${order.id}`).send(document);
        assert.equal(res.status, 403, `the owner reached ${Object.keys(document)[0]}`);
      }
      const spots = await request(app).put(`/api/orders/${order.id}/spots`).send({ lock: true });
      assert.equal(spots.status, 403, "the owner reached the spots PUT");
      const item = await request(app).post(`/api/orders/${order.id}/items`).send({ item: {} });
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
  }, { lock: ORDER_LOCK });
});

// ------------------------------------------------- status is a label, only

test("a status write moves the label and NOTHING else", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
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
  }, { lock: ORDER_LOCK });
});

// ------------------------------------------------------- the cancel dispatch

test("the cancel document reaches the label pipeline and a label failure cancels nothing", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await asAdmin(admin, async () => {
      const res = await request(app)
        .patch(`/api/orders/${order.id}`)
        .send({
          cancel: {
            return_shipment: {
              address: { recipient_name: owner.name, phone_number: "5555550100" },
              service: { serviceType: "FEDEX_GROUND" },
            },
          },
        });

      // NOT a refusal: the document is sound and dispatch began. What answers
      // is the FedEx live-API guard - the first act of the cancel pipeline is
      // the label, refused during a test run - which is a 500, never a 4xx.
      assert.equal(
        res.status,
        500,
        `expected the label guard's 500, got ${res.status}: ${JSON.stringify(res.body)}`
      );

      const { rows } = await client.query(
        `SELECT status FROM orders.orders WHERE id = $1`,
        [order.id]
      );
      assert.notEqual(rows[0].status, "Cancelled");
    });
  }, { lock: ORDER_LOCK });
});

// ------------------------------------------------------------ the refusals

test("an unknown field is refused over HTTP and executes nothing beside it", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
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
  }, { lock: ORDER_LOCK });
});

test("a nonexistent order answers 404 to an admin", async () => {
  await inPinnedTransaction(async () => {
    await asAdmin(admin, async () => {
      const res = await request(app)
        .patch("/api/orders/00000000-0000-4000-8000-000000000000")
        .send({ status: "Received" });
      assert.equal(res.status, 404, `answered ${res.status}`);
    });
  }, { lock: ORDER_LOCK });
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

test("finalize + label in one document equals finalize then label in sequence", async () => {
  let combined: Snapshot | undefined;
  await inPinnedTransaction(async (client: PoolClient) => {
    await pinMetals(client);
    await asAdmin(admin, async () => {
      const res = await request(app)
        .patch(`/api/orders/${order.id}`)
        .send({ finalize_pricing: true, status: "Payment Processing" });
      assert.equal(res.status, 200, `combined answered ${res.status}: ${JSON.stringify(res.body)}`);
      combined = await snapshot(client, order.id);
    });
  }, { lock: ORDER_LOCK });

  let sequential: Snapshot | undefined;
  await inPinnedTransaction(async (client: PoolClient) => {
    await pinMetals(client);
    await asAdmin(admin, async () => {
      const finalize = await request(app)
        .patch(`/api/orders/${order.id}`)
        .send({ finalize_pricing: true });
      assert.equal(finalize.status, 200, `finalize answered ${finalize.status}`);

      const label = await request(app)
        .patch(`/api/orders/${order.id}`)
        .send({ status: "Payment Processing" });
      assert.equal(label.status, 200, `label answered ${label.status}`);
      sequential = await snapshot(client, order.id);
    });
  }, { lock: ORDER_LOCK });

  assert.ok(combined, "the combined document never produced a snapshot");
  assert.ok(sequential, "the sequential requests never produced a snapshot");
  assert.deepEqual(
    combined,
    sequential,
    "one document and two sequential requests left the order in different states"
  );
  assert.equal(combined.order.status, "Payment Processing");
  assert.equal(combined.order.spots_locked, true, "finalizing did not pin the spots");
  assert.ok(combined.order.total !== null, "finalizing did not price the order");
});

test("nothing this file did survived the transactions", async () => {
  const [{ status }] = await outside<{ status: string }>(
    `SELECT status FROM orders.orders WHERE id = $1`,
    [order.id]
  );
  assert.equal(status, order.status, "an order's status was really moved in dev");

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
