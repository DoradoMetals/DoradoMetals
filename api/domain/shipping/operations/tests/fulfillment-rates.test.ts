// GET /api/fulfillments/:id/rates - the client sends one id (Jacob,
// 2026-09-03: "all the stuff that feeds into it can live directly on the
// server"), and it is the DRAFT FULFILLMENT's, because the parcel facts a rate
// is quoted from are its columns (rulings 69/70, migration 128). Every refusal
// below needs no network at all: each one throws inside
// domain/shipping/operations/service.ts's getFulfillmentRates before a carrier
// is ever asked anything.
//
// THE SUCCESS PATH IS SKIPPED, NAMED, BELOW. tests/cassettes/fedex/rate-
// quote.json was recorded for providers/shipments/tests/fedex-cassettes.
// test.ts's own fixed request (a synthetic Houston address, a 5 lb package,
// an explicit DROPOFF_AT_FEDEX_LOCATION pickupType, no declared value).
// nock.back matches a cassette by exact request body, and this endpoint
// builds its own request from a real checkout's own address, package and
// priced items - reproducing the recorded body would mean contriving a
// basket that prices to exactly zero and a package/address matching the
// cassette's literals byte for byte, which would pin the test to the
// cassette's incidental shape rather than to this endpoint's actual
// behaviour. Recording a fresh cassette needs a live FedEx sandbox
// credential this session does not have.
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

// THE DRAFT IS THE SUBJECT NOW, so every test starts by asking fulfillments
// for one against the caller's own checkout - which is exactly what the
// stepper does the moment a handoff is picked.
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

// A fulfillment that is not a SHIPMENT has no parcel to rate, and that is a
// state a caller can act on rather than a fault.
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
    // A DRAFT TAKES THE CUSTOMER'S DEFAULT ADDRESS when they have one, so this
    // person deliberately has no book at all - which is the state the refusal
    // is about.
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

// A DRAFT IS THE CHECKOUT OWNER'S, and nobody else's - the id is a uuid in a
// URL, so this is the only thing stopping one customer reading another's
// collection address and appointment time.
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
    // The control: the owner reaches their own.
    assert.equal(
      (await as(customer, () => request(app).get(`/api/fulfillments/${draft}`))).status, 200
    );
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] });
});

// See the file header - no cassette matches this endpoint's own request
// shape, and recording one needs a live sandbox credential.
test.skip(
  "a complete purchase checkout gets back priced services (NO CASSETTE for this request shape)",
  () => {}
);
