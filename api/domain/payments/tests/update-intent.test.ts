import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import request from "supertest";
import type { PoolClient } from "pg";
import pool from "#pool";
import query from "#shared/db/query.ts";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { withCassette } from "#shared/testing/cassettes.ts";
import { aUser, anAddress } from "#shared/testing/builders/index.ts";
import * as addressService from "#domain/places/addresses/service.ts";

await mockSessions();
const { default: app } = await import("#app");

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

test("the addresses service can resolve one address by id", async () => {
  assert.equal(
    typeof addressService.getAddressFromId,
    "function",
    "getAddressFromId is missing - domain/payments/service.ts awaits it"
  );

  await inPinnedTransaction(async (c) => {
    const customer = await aUser(c);
    const built = await anAddress(c, customer);

    const address = await addressService.getAddressFromId(built.id);
    assert.ok(address, "a real address id resolved to nothing");
    assert.equal(address.id, built.id, "it returned a different address");
    assert.ok(
      typeof address.state === "string" || address.state === null,
      "the caller reads `address?.state` to decide the tax state"
    );
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ADDRESSES });
});

test("an unknown address id resolves to nothing rather than throwing", async () => {
  const address = await addressService.getAddressFromId(
    "00000000-0000-4000-8000-000000000000"
  );
  assert.equal(address, undefined, "an unknown id should resolve to undefined");
});

test("update_payment_intent succeeds against a recorded Stripe response", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const customer = await aUser(c);

    await query(
      `UPDATE auth.users SET "stripeCustomerId" = $1 WHERE id = $2`,
      ["cus_cassette_update_intent", customer.id],
      c
    );

    await withCassette("stripe/create-payment-intent.json", () =>
      as(Object.assign({}, customer, { role: "user" }), async () => {
        const res = await request(app)
          .post("/api/stripe/update_payment_intent")
          .send({ type: "customer" });

        assert.equal(
          res.status, 200,
          `expected 200, got ${res.status}: ${JSON.stringify(res.body)}`
        );
        assert.ok(
          typeof res.body === "string" && res.body.startsWith("pi_"),
          `no client_secret came back: ${JSON.stringify(res.body)}`
        );
      })
    );
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ADDRESSES });
});
