import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#pool";
import query from "#shared/db/query.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { withCassette } from "#shared/testing/cassettes.ts";
import { aUser, aCart, aProduct } from "#shared/testing/builders/index.ts";
import { anUnknownId } from "#shared/testing/builders/ids.ts";
import * as stripe from "#providers/payment/stripe.ts";
import * as service from "#payments/service.ts";

afterAll(async () => {
  await pool.end();
});

const METADATA = { type: "customer", user_id: "cassette-user", session_id: "cassette-session" };

async function seedOpenIntent(
  c: PoolClient, session_id: string, user_id: string, provider_ref: string
): Promise<void> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO payments.intents (session_id, type, status, amount_expected, user_id)
     VALUES ($1, 'customer', 'requires_payment_method', 42, $2) RETURNING id`,
    [session_id, user_id], c
  );
  await query(
    `INSERT INTO payments.attempts (id, intent_id, provider, provider_ref, amount, status)
     VALUES ($1, $1, 'stripe', $2, 42, 'requires_payment_method')`,
    [rows[0]!.id, provider_ref], c
  );
}

test("retrievePaymentIntent creates a fresh intent when nothing is reusable", async () => {
  await inPinnedTransaction(async (c) => {
    const customer = await aUser(c);
    await c.query(
      `UPDATE auth.users SET "stripeCustomerId" = $1 WHERE id = $2`,
      ["cus_cassette_retrieve", customer.id]
    );

    const caller = { session_id: anUnknownId(), user_id: customer.id };
    const intent = await withCassette("stripe/create-payment-intent.json", () =>
      service.retrievePaymentIntent(caller, "customer", undefined)
    );

    assert.ok(intent.id.startsWith("pi_"), `unexpected intent id ${intent.id}`);
    assert.ok(intent.client_secret, "no client_secret came back for the frontend to confirm with");
  }, { actor: TEST_ACTOR.id, lock: LOCKS.USERS });
});

test("updatePaymentIntent self-heals when Stripe reports the local intent went stale", async () => {
  await inPinnedTransaction(async (c) => {
    const customer = await aUser(c);
    await c.query(
      `UPDATE auth.users SET "stripeCustomerId" = $1 WHERE id = $2`,
      ["cus_cassette_self_heal", customer.id]
    );
    const product = await aProduct(c);
    await aCart(c, customer, { direction: "sale" }).withBullion(product, 1);

    const session_id = anUnknownId();
    await seedOpenIntent(c, session_id, customer.id, "pi_cassette_stale_intent");

    const caller = { session_id, user_id: customer.id };
    const result = await withCassette("stripe/self-heal-stale-intent.json", () =>
      service.updatePaymentIntent(caller, { type: "customer" })
    );

    assert.ok(result.id.startsWith("pi_"), `unexpected intent id ${result.id}`);
    assert.notEqual(
      result.id, "pi_cassette_stale_intent",
      "a stale, resolved intent should have been replaced rather than reused"
    );
  }, { actor: TEST_ACTOR.id, lock: LOCKS.USERS });
});

test("cancelPaymentIntent cancels through Stripe and is readable afterwards", async () => {
  await inPinnedTransaction(async () => {
    const canceled = await withCassette("stripe/cancel-intent.json", async () => {
      const created = await stripe.createIntent({
        amount: 4200, metadata: METADATA, idempotencyKey: "cassette:cancel-intent:v1",
      });
      return await service.cancelPaymentIntent(created.id);
    });

    assert.equal(canceled.status, "canceled");
  }, { actor: TEST_ACTOR.id, lock: LOCKS.USERS });
});
