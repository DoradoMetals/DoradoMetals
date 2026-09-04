import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import request from "supertest";
import pool from "#pool";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import {
  aUser, aProduct, anAddress, packageId, carrierServiceId, fulfillmentMethodId,
} from "#shared/testing/builders/index.ts";

await mockSessions();
const { default: app } = await import("#app");
const checkoutService = await import("#domain/checkout/service.ts");

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

type Person = { id: string };
async function aDraft(customer: Person): Promise<string> {
  const row = await checkoutService.getRowFor(customer.id, "purchase");
  const res = await as(customer, () =>
    request(app).post("/api/fulfillments").send({ checkout_id: row.id })
  );
  assert.equal(res.status, 200, res.text);
  return res.body.fulfillment.id as string;
}

const rates = (customer: Person, fulfillment_id: string) =>
  as(customer, () => request(app).get(`/api/fulfillments/${fulfillment_id}/rates`));

test("an empty basket is refused before any carrier is asked", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const customer = await aUser(c);
    const res = await rates(customer, await aDraft(customer));
    assert.equal(res.status, 422, `answered ${res.status}: ${JSON.stringify(res.body)}`);
    assert.match(res.body?.error?.message ?? "", /no items to rate/);
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] });
});

test("a collection has no parcel, so there is nothing to rate", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const customer = await aUser(c);
    const row = await checkoutService.getRowFor(customer.id, "purchase");
    const method_id = await fulfillmentMethodId(c, "PICKUP", "purchase");
    const collected = await as(customer, () =>
      request(app).post("/api/fulfillments").send({ checkout_id: row.id, method_id })
    );
    assert.equal(collected.status, 200, collected.text);
    const res = await rates(customer, collected.body.fulfillment.id);
    assert.equal(res.status, 422, `answered ${res.status}: ${JSON.stringify(res.body)}`);
    assert.match(res.body?.error?.message ?? "", /not a shipment/);
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] });
});

test("no package chosen is refused before any carrier is asked", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const customer = await aUser(c);
    const product = await aProduct(c);
    const put = await as(customer, () =>
      request(app)
        .put("/api/checkout/items")
        .query({ direction: "purchase" })
        .send({ items: [{ bullion_id: product.id, quantity: 1 }] })
    );
    assert.equal(put.status, 200, put.text);

    const res = await rates(customer, await aDraft(customer));
    assert.equal(res.status, 422, `answered ${res.status}: ${JSON.stringify(res.body)}`);
    assert.match(res.body?.error?.message ?? "", /choose a package/);
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] });
});

test("no address chosen is refused before any carrier is asked", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const customer = await aUser(c);
    const product = await aProduct(c);
    const box = await packageId(c, "Small Box");
    const service = await carrierServiceId(c, "Express Saver");

    await as(customer, () =>
      request(app)
        .put("/api/checkout/items")
        .query({ direction: "purchase" })
        .send({ items: [{ bullion_id: product.id, quantity: 1 }] })
    );
    const draft = await aDraft(customer);
    const patched = await as(customer, () =>
      request(app).patch(`/api/fulfillments/${draft}`).send({
        shipment: { package_id: box, carrier_service_id: service },
      })
    );
    assert.equal(patched.status, 200, patched.text);

    const res = await rates(customer, draft);
    assert.equal(res.status, 422, `answered ${res.status}: ${JSON.stringify(res.body)}`);
    assert.match(res.body?.error?.message ?? "", /choose an address/);
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] });
});

test("a stranger cannot read somebody else's draft or its rates", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const customer = await aUser(c);
    const stranger = await aUser(c, { name: "A Stranger" });
    await anAddress(c, customer);
    const draft = await aDraft(customer);

    assert.equal((await rates(stranger, draft)).status, 404);
    assert.equal(
      (await as(stranger, () => request(app).get(`/api/fulfillments/${draft}`))).status, 404
    );
    assert.equal(
      (await as(stranger, () =>
        request(app).patch(`/api/fulfillments/${draft}`).send({ shipment: { package_id: null } })
      )).status,
      404
    );
    assert.equal(
      (await as(customer, () => request(app).get(`/api/fulfillments/${draft}`))).status, 200
    );
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] });
});

test.skip(
  "a complete purchase checkout gets back priced services (NO CASSETTE for this request shape)",
  () => {}
);
