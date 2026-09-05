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
  aUser, anAddress, anOrder, anUnknownId, paymentMethodId, fulfillmentMethodId,
} from "#shared/testing/builders/index.ts";
import { LOCKS } from "#shared/testing/locks.ts";

await mockSessions();
const { default: app } = await import("#app");

type UserFixture = { id: string; name: string | null; email: string | null };

let purchaseMethodId: string;
let saleMethodId: string;
let hiddenMethodId: string;

const customer: UserFixture = TEST_CUSTOMER;
const admin: UserFixture = TEST_ACTOR;

const checkoutIdFor = async (
  who: UserFixture, direction: "purchase" | "sale" = "purchase"
): Promise<string> =>
  (await as(who, () => request(app).get(`/api/checkout?direction=${direction}`))).body.id;

const chooseHandover = async (
  who: UserFixture,
  choice: { method_id?: string; handoff_code?: string },
  direction: "purchase" | "sale" = "purchase"
) => {
  const checkout_id = await checkoutIdFor(who, direction);
  return await as(who, () =>
    request(app).post("/api/fulfillments").send({ checkout_id, ...choice })
  );
};

beforeAll(async () => {
  const methods = await outside<{ id: string; type: string; direction: string; hidden: boolean }>(
    `SELECT id, type, direction, hidden FROM fulfillments.methods WHERE enabled`
  );
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

test("GET /api/checkout mints the row on first read, one per direction", async () => {
  await inPinnedTransaction(async () => {
    const first = await as(customer, () =>
      request(app).get("/api/checkout?direction=purchase")
    );
    assert.equal(first.status, 200);
    assert.equal(first.body.direction, "purchase");
    assert.equal(first.body.user_id, customer.id);
    assert.equal(first.body.fulfillment_id, null);
    assert.equal(first.body.fulfillment_method_type, undefined);
    assert.equal(first.body.handoff_code, undefined);
    assert.equal(first.body.requires_schedule, undefined);
    assert.equal(first.body.item_count, undefined);
    assert.equal(first.body.ready_to_place, undefined);
    assert.deepEqual(
      first.body.missing, ["items", "fulfillment_id", "payment_details_id"]
    );
    assert.ok(!first.body.missing.includes("package_id"));

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

test("PATCH writes the whitelisted id columns and answers the fresh row", async (t) => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const address = { id: (await anAddress(c, customer)).id };
    const pm = { id: await paymentMethodId(c, "ACH", "purchase") };

    const res = await as(customer, () =>
      request(app).patch("/api/checkout").send({
        direction: "purchase",
        recipient_address_id: address.id,
        payment_method_id: pm.id,
      })
    );
    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.recipient_address_id, address.id);
    assert.equal(res.body.payment_method_id, pm.id);

    const cleared = await as(customer, () =>
      request(app).patch("/api/checkout").send({
        direction: "purchase",
        recipient_address_id: null,
      })
    );
    assert.equal(cleared.body.recipient_address_id, null);
    assert.equal(
      cleared.body.payment_method_id, pm.id,
      "clearing one column disturbed another"
    );
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] });
});

test("an address lands only if it is in the CALLER'S book", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const own = { address_id: (await anAddress(c, customer)).id };
    const someoneElse = await aUser(c);
    const foreign = { address_id: (await anAddress(c, someoneElse)).id };

    const good = await as(customer, () =>
      request(app).patch("/api/checkout").send({
        direction: "purchase",
        recipient_address_id: own.address_id,
      })
    );
    assert.equal(good.status, 200, good.text);
    assert.equal(good.body.recipient_address_id, own.address_id);

    const theft = await as(customer, () =>
      request(app).patch("/api/checkout").send({
        direction: "purchase",
        recipient_address_id: foreign.address_id,
      })
    );
    assert.equal(theft.status, 422, "somebody else's address id was accepted");
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] });
});

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
        recipient_address_id: "33333333-3333-4333-8333-333333333333",
      })
    );
    assert.equal(res.status, 422, res.text);
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] });
});

test("a malformed start_time is refused before it reaches the database", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const draft = await chooseHandover(customer, {
      method_id: await fulfillmentMethodId(c, "PICKUP", "purchase"),
    });
    const res = await as(customer, () =>
      request(app)
        .patch(`/api/fulfillments/${draft.body.fulfillment.id}`)
        .send({ pickup: { start_time: "half past never" } })
    );
    assert.equal(res.status, 422, res.text);
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] });
});

test("the draft is minted ONCE, linked, and later calls move its method in place", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const first = await chooseHandover(customer, { method_id: purchaseMethodId });
    assert.equal(first.status, 200, first.text);
    const draftId = first.body.fulfillment.id;
    assert.ok(draftId, "no draft came back");
    assert.equal(
      (await as(customer, () => request(app).get("/api/checkout?direction=purchase"))).body
        .fulfillment_id,
      draftId,
      "the row did not keep the draft's id"
    );
    assert.ok(
      !first.body.missing.includes("pickup_date"),
      "a dropoff was asked for a courier slot"
    );
    const { rows: draft } = await c.query(
      `SELECT method_id, order_id FROM fulfillments.fulfillments WHERE id = $1`, [draftId]
    );
    assert.equal(draft[0].method_id, purchaseMethodId);
    assert.equal(draft[0].order_id, null, "a draft must have no order");

    const other = { id: await fulfillmentMethodId(c, "CARRIER PICKUP", "purchase") };
    assert.notEqual(other.id, purchaseMethodId, "the fixture named the same method twice");
    const second = await chooseHandover(customer, { method_id: other.id });
    assert.equal(second.status, 200, second.text);
    assert.equal(second.body.fulfillment.id, draftId, "a second call minted a second draft");
    assert.ok(second.body.missing.includes("pickup_date"));
    assert.ok(second.body.missing.includes("pickup_time"));

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
    const res = await chooseHandover(customer, { method_id: hiddenMethodId });
    assert.equal(res.status, 409, `a hidden method was accepted: ${res.text}`);
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] });
});

test("a sale method cannot land on a purchase checkout", async () => {
  await inPinnedTransaction(async () => {
    const res = await chooseHandover(customer, { method_id: saleMethodId });
    assert.equal(res.status, 409, `a cross-direction method was accepted: ${res.text}`);
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] });
});

test("a draft is INVISIBLE to order-facing reads", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    await chooseHandover(customer, { method_id: purchaseMethodId });
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
      "#logistics/fulfillments/service.ts"
    ).then((m) => ({ default: m }));

    const res = await chooseHandover(customer, { method_id: purchaseMethodId });
    const draftId = res.body.fulfillment.id;

    const order = await anOrder(c, customer, { direction: "purchase" });

    const attached = await fulfillmentService.attachToOrder(draftId, order.id, c);
    assert.equal(attached.fulfillment.order_id, order.id);

    await assert.rejects(
      () => fulfillmentService.attachToOrder(draftId, order.id, c),
      /not a draft/,
      "a second attach did not refuse"
    );
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] });
});

test("two customers' rows never touch: the stranger sees their own empty checkout", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const stranger = await aUser(c, { name: "A Stranger" });
    await chooseHandover(customer, { method_id: purchaseMethodId });
    const theirs = await as(stranger, () =>
      request(app).get("/api/checkout?direction=purchase")
    );
    assert.equal(theirs.status, 200);
    assert.equal(theirs.body.user_id, stranger.id);
    assert.equal(theirs.body.fulfillment_id, null, "the stranger saw the customer's draft");
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] });
});

test("an admin reads and writes a NAMED customer's checkout by ?user_id=", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const stranger = await aUser(c, { name: "A Stranger" });
    const address = { id: (await anAddress(c, stranger)).id };

    const got = await asAdmin(admin, () =>
      request(app).get(`/api/checkout?direction=purchase&user_id=${stranger.id}`)
    );
    assert.equal(got.status, 200, got.text);
    assert.equal(got.body.user_id, stranger.id, "the admin did not reach the named row");

    const patched = await asAdmin(admin, () =>
      request(app)
        .patch(`/api/checkout?user_id=${stranger.id}`)
        .send({ direction: "purchase", recipient_address_id: address.id })
    );
    assert.equal(patched.status, 200, patched.text);
    assert.equal(patched.body.user_id, stranger.id);
    assert.equal(patched.body.recipient_address_id, address.id);
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] });
});

test("a non-admin naming somebody else's user_id is refused, not answered", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
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
