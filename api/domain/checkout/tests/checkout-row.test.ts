// THE CHECKOUT ROW SURFACE (D208), over real HTTP, nothing committed.
//
// Jacob's design for the checkout conversion: the stepper writes IDS into the
// customer's checkout row, the fulfillment is a live DRAFT the same steps
// mutate, and order creation consumes what the server holds. This is the
// maximum-coverage suite that design was ordered with ("this needs maximum
// amount of testing btw - these are core to our app"): every surface, every
// refusal, and the invariants that make the draft safe - a draft is invisible
// to order reads, the attach is one-way, and the whitelist holds.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import request from "supertest";
import pool from "#pool";
import { mockSessions, restoreSessions, as, asAdmin } from "#shared/testing/session.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";
import { TEST_CUSTOMER } from "#shared/testing/actor.ts";
import {
  aUser, anAddress, anOrder, anId, packageId, saleServiceId, paymentMethodId,
  fulfillmentMethodId,
} from "#shared/testing/builders/index.ts";
import { LOCKS } from "#shared/testing/locks.ts";

await mockSessions();
const { default: app } = await import("#app");

type UserFixture = { id: string; name: string | null; email: string | null };

let purchaseMethodId: string; // an offered purchase-direction fulfillment method
let saleMethodId: string;     // an offered sale-direction one
let hiddenMethodId: string;   // a hidden method the menu never offered

// THE TWO NAMED PEOPLE AND THE SEEDED METHODS (lane 1). The customer and the
// stranger were the first two non-admin rows of the frozen exchange.users
// table, joined to auth.users to avoid picking one that existed in only one
// place - a join 118 made pointless. They are named now, and anything they
// need to OWN (a cart, an address) is built inside the transaction.
//
// The methods stay a read: `fulfillments.methods` is seeded reference data and
// what these tests mean is "an offered purchase method", "an offered sale
// method" and "a hidden one" - three named facts about the seed, resolved once
// rather than by three LIMIT 1 queries.
const customer: UserFixture = TEST_CUSTOMER;
const admin: UserFixture = TEST_ACTOR;

beforeAll(async () => {
  const methods = await outside<{ id: string; type: string; direction: string; hidden: boolean }>(
    `SELECT id, type, direction, hidden FROM fulfillments.methods WHERE enabled`
  );
  // NAMED, not "the first one that matches": which method sorts first is not a
  // fact any test here means, and `other` below has to be a DIFFERENT one.
  purchaseMethodId = methods.find(
    (m) => m.direction === "purchase" && m.type === "CARRIER DROPOFF")!.id;
  saleMethodId = methods.find((m) => m.direction === "sale" && !m.hidden)!.id;
  hiddenMethodId = methods.find((m) => m.direction === "purchase" && m.hidden)!.id;
  assert.ok(purchaseMethodId && saleMethodId && hiddenMethodId, "the methods seed is missing rows");
});

afterAll(async () => {
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
    assert.equal(first.body.fulfillment_id, null);
    // THE ROW PLUS ONE LIST (Jacob, 2026-09-04). `fulfillment_method_type`,
    // `handoff_code` and `requires_schedule` were scalar joins onto lists the
    // stepper already renders (ruling 12); `item_count` and the three
    // `ready_*` booleans were second readings of `missing`.
    assert.equal(first.body.fulfillment_method_type, undefined);
    assert.equal(first.body.handoff_code, undefined);
    assert.equal(first.body.requires_schedule, undefined);
    assert.equal(first.body.item_count, undefined);
    assert.equal(first.body.ready_to_place, undefined);
    // A purchase with no method chosen owes its items, the method itself and
    // the payout account - and nothing about a box it may never need.
    assert.deepEqual(first.body.missing, ["items", "fulfillment_method", "payout_account"]);
    // AND NOTHING ABOUT A BOX: `missing` follows the chosen method's CATEGORY,
    // and nothing has been chosen yet (Jacob, 2026-09-04: "If it's a direct or
    // pickup, why would it need shipper_address_id or package_id?").
    assert.ok(!first.body.missing.includes("package"));

    const again = await as(customer, () =>
      request(app).get("/api/checkout?direction=purchase")
    );
    assert.equal(again.body.id, first.body.id, "a second read minted a second row");

    const sale = await as(customer, () =>
      request(app).get("/api/checkout?direction=sale")
    );
    assert.notEqual(sale.body.id, first.body.id, "the two directions shared a row");
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] });
});

// 400, NOT 422 (ruling 48, 2026-09-03): a direction is parsed against the
// contract's `Direction` at the transport, like every other field, so a
// value that is not one of the two labels never reaches the domain. The
// earlier 422 came from a domain function that only re-typed its input.
test("an anonymous caller gets nothing, and a bad direction is refused", async () => {
  await inPinnedTransaction(async () => {
    const anon = await request(app).get("/api/checkout?direction=purchase");
    assert.equal(anon.status, 401);

    const bogus = await as(customer, () =>
      request(app).get("/api/checkout?direction=sideways")
    );
    assert.equal(bogus.status, 400);
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] });
});

// ------------------------------------------------------------------- patch

test("PATCH writes the whitelisted id columns and answers the fresh row", async (t) => {
  await inPinnedTransaction(async (c: PoolClient) => {
    // Three seeded reference rows, each named rather than taken by LIMIT 1 -
    // see shared/testing/builders/reference.ts on the distinction.
    const pkg = { id: await packageId(c, "Small Box") };
    const svc = { id: await saleServiceId(c) };
    const pm = { id: await paymentMethodId(c, "ACH", "purchase") };

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
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] });
});

test("an address lands only if it is in the CALLER'S book", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    // TWO BOOKS, BUILT (lane 1). Book membership is the check the service runs
    // (places.user_addresses) and nothing else, so the claim needs one address
    // in the caller's book and one in somebody else's - which this hunted for
    // with a NOT EXISTS and then asserted it had found. Both are stated now.
    const own = { address_id: (await anAddress(c, customer)).id };
    const someoneElse = await aUser(c);
    const foreign = { address_id: (await anAddress(c, someoneElse)).id };

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
    assert.equal(theft.status, 422, "somebody else's address id was accepted");
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] });
});

// THE WHITELIST HOLDS, AND IT NOW REFUSES OUT LOUD. The contract schema is
// the whitelist and it is parsed in STRICT mode, so a column the customer may
// not write is a 400 naming it rather than a silently ignored key. Ignoring
// them was the older behaviour; a request that thinks it set fulfillment_id
// and got a 200 is worse than one that is told no.
test("the whitelist holds: fulfillment_id, user_id and id cannot be patched in", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const somebodyElse = await aUser(c);
    const before = await as(customer, () =>
      request(app).get("/api/checkout?direction=purchase")
    );

    for (const body of [
      { fulfillment_id: "11111111-1111-4111-8111-111111111111" },
      { user_id: somebodyElse.id },
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
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] });
});

test("a reference id that matches no row is refused, not a 500", async () => {
  await inPinnedTransaction(async () => {
    const res = await as(customer, () =>
      request(app).patch("/api/checkout").send({
        direction: "purchase",
        package_id: "33333333-3333-4333-8333-333333333333",
      })
    );
    assert.equal(res.status, 422, res.text);
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] });
});

test("a malformed appointment_time is refused before it reaches the database", async () => {
  await inPinnedTransaction(async () => {
    const res = await as(customer, () =>
      request(app).patch("/api/checkout").send({
        direction: "purchase",
        appointment_time: "half past never",
      })
    );
    assert.equal(res.status, 422);
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] });
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
    // The method type left the wire too (Jacob, 2026-09-04): the row names its
    // fulfillment, and the stepper selects the handoff by that id against the
    // list it already renders. What the row still says is what it OWES - and a
    // dropoff owes no courier slot, which is the only thing the type was read
    // for here.
    assert.equal(first.body.fulfillment_method_type, undefined);
    assert.ok(
      !first.body.missing.includes("pickup_schedule"),
      "a dropoff was asked for a courier slot"
    );
    const { rows: draft } = await c.query(
      `SELECT method_id, order_id FROM fulfillments.fulfillments WHERE id = $1`, [draftId]
    );
    assert.equal(draft[0].method_id, purchaseMethodId);
    assert.equal(draft[0].order_id, null, "a draft must have no order");

    // Change the option: same draft, new method - Jacob's "each time an
    // option is changed, the server-side fulfillment gets updated".
    // The OTHER offered purchase method, named: the seed has CARRIER DROPOFF,
    // CARRIER PICKUP, PICKUP and APPOINTMENT, and what matters is that it is
    // not the one already on the row.
    const other = { id: await fulfillmentMethodId(c, "CARRIER PICKUP", "purchase") };
    assert.notEqual(other.id, purchaseMethodId, "the fixture named the same method twice");
    const second = await as(customer, () =>
      request(app).post("/api/checkout/fulfillment").send({
        direction: "purchase",
        method_id: other.id,
      })
    );
    assert.equal(second.status, 200, second.text);
    assert.equal(second.body.fulfillment_id, draftId, "a second call minted a second draft");
    // A carrier pickup is the schedulable handoff, so the schedule becomes a
    // step the customer still owes - which is the ONE thing the method type
    // and `requires_schedule` were ever read for here, and `missing` says it.
    assert.equal(second.body.fulfillment_method_type, undefined);
    assert.equal(second.body.requires_schedule, undefined);
    assert.ok(second.body.missing.includes("pickup_schedule"));

    const { rows: drafts } = await c.query(
      `SELECT count(*)::int AS n FROM fulfillments.fulfillments
        WHERE order_id IS NULL AND created_by_id = $1`,
      [customer.id]
    );
    assert.equal(drafts[0].n, 1, "draft rows accumulated");
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] });
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
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] });
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
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] });
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
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] });
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

    // THE ATTACH TARGET IS BUILT (lane 1). "Any order in both schemas will do;
    // the transaction rolls back" was true and still meant the fixture was a
    // real order, found by NOT EXISTS - and a built order has no fulfillment
    // by construction, so the search and its guard both go.
    const order = await anOrder(c, customer, { direction: "purchase" });

    const attached = await fulfillmentService.attachDraft(
      { fulfillment_id: draftId, order_id: order.id }, c
    );
    assert.equal(attached.fulfillment.order_id, order.id);

    await assert.rejects(
      () => fulfillmentService.attachDraft(
        { fulfillment_id: draftId, order_id: order.id }, c
      ),
      /not a draft/,
      "a second attach did not refuse"
    );
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] });
});

test("two customers' rows never touch: the stranger sees their own empty checkout", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    // THE STRANGER IS BUILT, per test: the checkout service resolves the
    // user_id it is given, so this person has to exist - and a built one has no
    // checkout at all, which is exactly what "their own empty checkout" needs.
    const stranger = await aUser(c, { name: "A Stranger" });
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
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] });
});

// -------------------------------------------------- admin-scoped access

// THE NARROW THING (D214 item 2): createOrderFromCheckout already lets an
// admin name any checkout_id; this is the other half - reading and writing a
// NAMED customer's row, the piece the admin sales-order create needed and did
// not have (see the comment this closes in
// features/orders/salesOrders/admin/queries.ts).
test("an admin reads and writes a NAMED customer's checkout by ?user_id=", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const stranger = await aUser(c, { name: "A Stranger" });
    const pkg = { id: await packageId(c, "Small Box") };

    const got = await asAdmin(admin, () =>
      request(app).get(`/api/checkout?direction=purchase&user_id=${stranger.id}`)
    );
    assert.equal(got.status, 200, got.text);
    assert.equal(got.body.user_id, stranger.id, "the admin did not reach the named row");

    const patched = await asAdmin(admin, () =>
      request(app)
        .patch(`/api/checkout?user_id=${stranger.id}`)
        .send({ direction: "purchase", package_id: pkg.id })
    );
    assert.equal(patched.status, 200, patched.text);
    assert.equal(patched.body.user_id, stranger.id);
    assert.equal(patched.body.package_id, pkg.id);
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] });
});

test("a non-admin naming somebody else's user_id is refused, not answered", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    // The refusal happens before any user is resolved, so this stranger need
    // not own anything - but it must be a DIFFERENT person from the caller,
    // which is the whole claim.
    const stranger = await aUser(c, { name: "A Stranger" });
    const read = await as(customer, () =>
      request(app).get(`/api/checkout?direction=purchase&user_id=${stranger.id}`)
    );
    assert.equal(read.status, 403, read.text);

    const write = await as(customer, () =>
      request(app)
        .patch(`/api/checkout?user_id=${stranger.id}`)
        .send({ direction: "purchase" })
    );
    assert.equal(write.status, 403, write.text);

    // Naming YOURSELF is not "somebody else" - a deployed client sending its
    // own id (the cart auto-sync does) must never be refused.
    const own = await as(customer, () =>
      request(app).get(`/api/checkout?direction=purchase&user_id=${customer.id}`)
    );
    assert.equal(own.status, 200, own.text);
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] });
});

test("an admin naming a user_id nothing owns gets 404, not a minted row", async () => {
  await inPinnedTransaction(async () => {
    const nobody = randomUUID();
    const read = await asAdmin(admin, () =>
      request(app).get(`/api/checkout?direction=purchase&user_id=${nobody}`)
    );
    assert.equal(read.status, 404, read.text);

    const write = await asAdmin(admin, () =>
      request(app)
        .patch(`/api/checkout?user_id=${nobody}`)
        .send({ direction: "purchase" })
    );
    assert.equal(write.status, 404, write.text);
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] });
});
