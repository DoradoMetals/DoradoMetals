// THE CHECKOUT ROW SURFACE (D208), over real HTTP, nothing committed.
//
// Jacob's design for the checkout conversion: the stepper writes IDS into the
// customer's checkout row, the fulfillment is a live DRAFT the same steps
// mutate, and order creation consumes what the server holds. This is the
// maximum-coverage suite that design was ordered with ("this needs maximum
// amount of testing btw - these are core to our app"): every surface, every
// refusal, and the invariants that make the draft safe - a draft is invisible
// to order reads, the attach is one-way, and the whitelist holds.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";
import { LOCKS } from "#shared/testing/locks.ts";

await mockSessions();
const { default: app } = await import("#app");

type UserFixture = { id: string; name: string | null; email: string | null };

let customer: UserFixture;
let stranger: UserFixture;
let purchaseMethodId: string; // an offered purchase-direction fulfillment method
let saleMethodId: string;     // an offered sale-direction one
let hiddenMethodId: string;   // a hidden method the menu never offered

before(async () => {
  const users = await outside<UserFixture>(
    `SELECT u.id, u.name, u.email FROM exchange.users u
      WHERE u.role IS DISTINCT FROM 'admin'
        AND EXISTS (SELECT 1 FROM auth.users a WHERE a.id = u.id)
      ORDER BY u.email LIMIT 2`
  );
  assert.ok(users.length >= 2, "dev needs two non-admin users present in auth.users");
  [customer, stranger] = users;

  const methods = await outside<{ id: string; direction: string; hidden: boolean }>(
    `SELECT id, direction, hidden FROM fulfillments.methods WHERE enabled`
  );
  purchaseMethodId = methods.find((m) => m.direction === "purchase" && !m.hidden)!.id;
  saleMethodId = methods.find((m) => m.direction === "sale" && !m.hidden)!.id;
  hiddenMethodId = methods.find((m) => m.direction === "purchase" && m.hidden)!.id;
  assert.ok(purchaseMethodId && saleMethodId && hiddenMethodId, "the methods seed is missing rows");
});

after(async () => {
  await restoreSessions();
  await pool.end();
});

// ------------------------------------------------------------------- reads

test("GET /api/checkout mints the row on first read, one per direction", async () => {
  await inPinnedTransaction(async () => {
    const first = await as(customer, () =>
      request(app).get("/api/checkout?direction=purchase")
    );
    assert.equal(first.status, 200);
    assert.equal(first.body.direction, "purchase");
    assert.equal(first.body.user_id, customer.id);
    assert.equal(first.body.fulfillment, null);

    const again = await as(customer, () =>
      request(app).get("/api/checkout?direction=purchase")
    );
    assert.equal(again.body.id, first.body.id, "a second read minted a second row");

    const sale = await as(customer, () =>
      request(app).get("/api/checkout?direction=sale")
    );
    assert.notEqual(sale.body.id, first.body.id, "the two directions shared a row");
  }, { lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] });
});

test("an anonymous caller gets nothing, and a bad direction is a 400", async () => {
  await inPinnedTransaction(async () => {
    const anon = await request(app).get("/api/checkout?direction=purchase");
    assert.equal(anon.status, 401);

    const bogus = await as(customer, () =>
      request(app).get("/api/checkout?direction=sideways")
    );
    assert.equal(bogus.status, 400);
  }, { lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] });
});

// ------------------------------------------------------------------- patch

test("PATCH writes the whitelisted id columns and answers the fresh row", async (t) => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { rows: [pkg] } = await c.query(`SELECT id FROM shipping.packages LIMIT 1`);
    const { rows: [svc] } = await c.query(
      `SELECT id FROM shipping.services WHERE carrier_id IS NULL AND price IS NOT NULL LIMIT 1`
    );
    const { rows: [pm] } = await c.query(
      `SELECT id FROM payments.methods WHERE direction = 'purchase' LIMIT 1`
    );
    t.diagnostic(`package ${pkg?.id}, service ${svc?.id}, method ${pm?.id}`);

    const res = await as(customer, () =>
      request(app).patch("/api/checkout").send({
        direction: "purchase",
        package_id: pkg.id,
        carrier_service_id: svc.id,
        payment_method_id: pm.id,
      })
    );
    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.package_id, pkg.id);
    assert.equal(res.body.carrier_service_id, svc.id);
    assert.equal(res.body.payment_method_id, pm.id);

    // Clearing is a write too - a customer un-picking an option.
    const cleared = await as(customer, () =>
      request(app).patch("/api/checkout").send({
        direction: "purchase",
        package_id: null,
      })
    );
    assert.equal(cleared.body.package_id, null);
    assert.equal(
      cleared.body.carrier_service_id, svc.id,
      "clearing one column disturbed another"
    );
  }, { lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] });
});

test("an address lands only if it is in the CALLER'S book", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    // An address of the customer's own - book membership is the check the
    // service runs (places.user_addresses), nothing else.
    const { rows: [own] } = await c.query(
      `SELECT ua.address_id FROM places.user_addresses ua
        WHERE ua.user_id = $1 LIMIT 1`,
      [customer.id]
    );
    // Somebody else's, in no book of the customer's.
    const { rows: [foreign] } = await c.query(
      `SELECT ua.address_id FROM places.user_addresses ua
        WHERE ua.user_id <> $1
          AND NOT EXISTS (SELECT 1 FROM places.user_addresses x
                           WHERE x.address_id = ua.address_id AND x.user_id = $1)
        LIMIT 1`,
      [customer.id]
    );
    assert.ok(own && foreign, "dev needs addresses in two different books");

    const good = await as(customer, () =>
      request(app).patch("/api/checkout").send({
        direction: "purchase",
        shipper_address_id: own.address_id,
      })
    );
    assert.equal(good.status, 200, good.text);
    assert.equal(good.body.shipper_address_id, own.address_id);

    const theft = await as(customer, () =>
      request(app).patch("/api/checkout").send({
        direction: "purchase",
        shipper_address_id: foreign.address_id,
      })
    );
    assert.equal(theft.status, 400, "somebody else's address id was accepted");
  }, { lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] });
});

// THE WHITELIST HOLDS, AND IT NOW REFUSES OUT LOUD. The contract schema is
// the whitelist and it is parsed in STRICT mode, so a column the customer may
// not write is a 400 naming it rather than a silently ignored key. Ignoring
// them was the older behaviour; a request that thinks it set fulfillment_id
// and got a 200 is worse than one that is told no.
test("the whitelist holds: fulfillment_id, user_id and id cannot be patched in", async () => {
  await inPinnedTransaction(async () => {
    const before = await as(customer, () =>
      request(app).get("/api/checkout?direction=purchase")
    );

    for (const body of [
      { fulfillment_id: "11111111-1111-4111-8111-111111111111" },
      { user_id: stranger.id },
      { id: "22222222-2222-4222-8222-222222222222" },
    ]) {
      const res = await as(customer, () =>
        request(app).patch("/api/checkout").send(Object.assign({ direction: "purchase" }, body))
      );
      assert.equal(res.status, 400, `${JSON.stringify(body)} was accepted: ${res.text}`);
    }

    const after = await as(customer, () =>
      request(app).get("/api/checkout?direction=purchase")
    );
    assert.equal(after.body.fulfillment_id, before.body.fulfillment_id);
    assert.equal(after.body.user_id, customer.id);
    assert.equal(after.body.id, before.body.id);
  }, { lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] });
});

test("a reference id that matches no row is a 400, not a 500", async () => {
  await inPinnedTransaction(async () => {
    const res = await as(customer, () =>
      request(app).patch("/api/checkout").send({
        direction: "purchase",
        package_id: "33333333-3333-4333-8333-333333333333",
      })
    );
    assert.equal(res.status, 400, res.text);
  }, { lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] });
});

test("a malformed appointment_time is refused before it reaches the database", async () => {
  await inPinnedTransaction(async () => {
    const res = await as(customer, () =>
      request(app).patch("/api/checkout").send({
        direction: "purchase",
        appointment_time: "half past never",
      })
    );
    assert.equal(res.status, 400);
  }, { lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] });
});

// ------------------------------------------------------- the draft fulfillment

test("the draft is minted ONCE, linked, and later calls move its method in place", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const first = await as(customer, () =>
      request(app).post("/api/checkout/fulfillment").send({
        direction: "purchase",
        method_id: purchaseMethodId,
      })
    );
    assert.equal(first.status, 200, first.text);
    const draftId = first.body.fulfillment_id;
    assert.ok(draftId, "the row did not keep the draft's id");
    assert.equal(first.body.fulfillment?.method_id, purchaseMethodId);
    assert.equal(first.body.fulfillment?.order_id, null, "a draft must have no order");

    // Change the option: same draft, new method - Jacob's "each time an
    // option is changed, the server-side fulfillment gets updated".
    const { rows: [other] } = await c.query(
      `SELECT id FROM fulfillments.methods
        WHERE direction = 'purchase' AND enabled AND NOT hidden AND id <> $1 LIMIT 1`,
      [purchaseMethodId]
    );
    const second = await as(customer, () =>
      request(app).post("/api/checkout/fulfillment").send({
        direction: "purchase",
        method_id: other.id,
      })
    );
    assert.equal(second.status, 200, second.text);
    assert.equal(second.body.fulfillment_id, draftId, "a second call minted a second draft");
    assert.equal(second.body.fulfillment?.method_id, other.id);

    const { rows: drafts } = await c.query(
      `SELECT count(*)::int AS n FROM fulfillments.fulfillments
        WHERE order_id IS NULL AND created_by_id = $1`,
      [customer.id]
    );
    assert.equal(drafts[0].n, 1, "draft rows accumulated");
  }, { lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] });
});

test("a hidden method never gets a draft - the menu has to mean something", async () => {
  await inPinnedTransaction(async () => {
    const res = await as(customer, () =>
      request(app).post("/api/checkout/fulfillment").send({
        direction: "purchase",
        method_id: hiddenMethodId,
      })
    );
    assert.equal(res.status, 409, `a hidden method was accepted: ${res.text}`);
  }, { lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] });
});

test("a sale method cannot land on a purchase checkout", async () => {
  await inPinnedTransaction(async () => {
    const res = await as(customer, () =>
      request(app).post("/api/checkout/fulfillment").send({
        direction: "purchase",
        method_id: saleMethodId,
      })
    );
    assert.equal(res.status, 409, `a cross-direction method was accepted: ${res.text}`);
  }, { lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] });
});

test("a draft is INVISIBLE to order-facing reads", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    await as(customer, () =>
      request(app).post("/api/checkout/fulfillment").send({
        direction: "purchase",
        method_id: purchaseMethodId,
      })
    );
    // Every order-facing read joins through order_id; a draft has none. The
    // schedule is the read that would leak an appointment to an employee
    // screen if a draft ever surfaced.
    const { rows } = await c.query(
      `SELECT f.id FROM fulfillments.fulfillments f
        JOIN orders.orders o ON o.id = f.order_id
        WHERE f.created_by_id = $1`,
      [customer.id]
    );
    assert.equal(rows.length, 0, "a draft joined to an order");
  }, { lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] });
});

test("the attach is one-way: once an order holds the draft, a second attach refuses", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { default: fulfillmentService } = await import(
      "#domain/fulfillments/service.ts"
    ).then((m) => ({ default: m }));

    const res = await as(customer, () =>
      request(app).post("/api/checkout/fulfillment").send({
        direction: "purchase",
        method_id: purchaseMethodId,
      })
    );
    const draftId = res.body.fulfillment_id;

    // Any order in both schemas will do as the attach target; the transaction
    // rolls back.
    const { rows: [order] } = await c.query(
      `SELECT o.id FROM orders.orders o
        WHERE NOT EXISTS (SELECT 1 FROM fulfillments.fulfillments f WHERE f.order_id = o.id)
        LIMIT 1`
    );
    assert.ok(order, "dev needs an order with no fulfillment yet");

    const attached = await fulfillmentService.attachDraft(
      { fulfillment_id: draftId, order_id: order.id }, c
    );
    assert.equal(attached.order_id, order.id);

    await assert.rejects(
      () => fulfillmentService.attachDraft(
        { fulfillment_id: draftId, order_id: order.id }, c
      ),
      /not a draft/,
      "a second attach did not refuse"
    );
  }, { lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] });
});

test("two customers' rows never touch: the stranger sees their own empty checkout", async () => {
  await inPinnedTransaction(async () => {
    await as(customer, () =>
      request(app).post("/api/checkout/fulfillment").send({
        direction: "purchase",
        method_id: purchaseMethodId,
      })
    );
    const theirs = await as(stranger, () =>
      request(app).get("/api/checkout?direction=purchase")
    );
    assert.equal(theirs.status, 200);
    assert.equal(theirs.body.user_id, stranger.id);
    assert.equal(theirs.body.fulfillment_id, null, "the stranger saw the customer's draft");
  }, { lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] });
});
