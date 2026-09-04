// GET /api/checkout/rates?direction= - the client sends only its direction
// (Jacob, 2026-09-03: "all the stuff that feeds into it can live directly on
// the server"). Every refusal below needs no network at all: each one throws
// inside domain/shipping/operations/service.ts's getCheckoutRates before a
// carrier is ever asked anything.
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
import { aUser, aProduct, packageId, carrierServiceId } from "#shared/testing/builders/index.ts";

await mockSessions();
const { default: app } = await import("#app");

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

test("an empty basket is refused before any carrier is asked", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const customer = await aUser(c);
    const res = await as(customer, () =>
      request(app).get("/api/checkout/rates").query({ direction: "purchase" })
    );
    assert.equal(res.status, 422, `answered ${res.status}: ${JSON.stringify(res.body)}`);
    assert.match(res.body?.error?.message ?? "", /no items to rate/);
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
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

    const res = await as(customer, () =>
      request(app).get("/api/checkout/rates").query({ direction: "purchase" })
    );
    assert.equal(res.status, 422, `answered ${res.status}: ${JSON.stringify(res.body)}`);
    assert.match(res.body?.error?.message ?? "", /choose a package/);
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
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
    const patched = await as(customer, () =>
      request(app).patch("/api/checkout").send({
        direction: "purchase", package_id: box, carrier_service_id: service,
      })
    );
    assert.equal(patched.status, 200, patched.text);

    const res = await as(customer, () =>
      request(app).get("/api/checkout/rates").query({ direction: "purchase" })
    );
    assert.equal(res.status, 422, `answered ${res.status}: ${JSON.stringify(res.body)}`);
    assert.match(res.body?.error?.message ?? "", /choose an address/);
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});

// See the file header - no cassette matches this endpoint's own request
// shape, and recording one needs a live sandbox credential.
test.skip(
  "a complete purchase checkout gets back priced services (NO CASSETTE for this request shape)",
  () => {}
);
