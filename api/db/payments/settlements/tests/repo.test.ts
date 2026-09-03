// payments.settlements, against real Postgres, every test rolled back.
//
// A settlement is money that MOVED. Its create is idempotent because a Stripe
// webhook is retried, and a retry must rewrite the row rather than raise.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#db";
import { inRollback } from "#shared/testing/rollback.ts";
import { aUser, aPaymentIntent } from "#shared/testing/builders/index.ts";
import * as intents from "#db/payments/intents/repo.ts";
import * as attempts from "#db/payments/attempts/repo.ts";
import * as settlements from "#db/payments/settlements/repo.ts";

let client: PoolClient;

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
  client = await pool.connect();
});
afterAll(async () => { client.release(); await pool.end(); });

const anAttempt = async (c: PoolClient) => {
  // Built, not discovered - see shared/testing/builders/index.ts.
  const intent = await aPaymentIntent(c, await aUser(c), {
    type: "checkout", status: "succeeded", amount_expected: 100,
  });
  return await attempts.create(
    {
      id: intent.id, intent_id: intent.id, provider: "stripe",
      provider_ref: `pi_${randomUUID().slice(0, 12)}`, amount: 100, status: "succeeded",
    },
    c
  );
};

test("a settlement is created and re-created without raising", async () => {
  await inRollback(async (c: PoolClient) => {
    const attempt = await anAttempt(c);
    const first = await settlements.create(
      {
        id: attempt.id, attempt_id: attempt.id, settled_amount: 100,
        provider: "stripe", provider_ref: attempt.provider_ref,
      },
      c
    );
    assert.equal(Number(first.settled_amount), 100);

    // The retry: same id, a corrected amount, no second row.
    const again = await settlements.create(
      {
        id: attempt.id, attempt_id: attempt.id, settled_amount: 114.8,
        provider: "stripe", provider_ref: attempt.provider_ref,
      },
      c
    );
    assert.equal(Number(again.settled_amount), 114.8);
    assert.equal((await settlements.listFor(attempt.id, c)).length, 1);
  });
});

test("update answers true for a real id and false for one with no settlement", async () => {
  await inRollback(async (c: PoolClient) => {
    const attempt = await anAttempt(c);
    await settlements.create(
      {
        id: attempt.id, attempt_id: attempt.id, settled_amount: 100,
        provider: "stripe", provider_ref: attempt.provider_ref,
      },
      c
    );

    assert.equal(await settlements.update(attempt.id, { settled_amount: 51.78 }, c), true);
    assert.equal(Number((await settlements.getOne(attempt.id, c))?.settled_amount), 51.78);
    assert.equal(await settlements.update(randomUUID(), { settled_amount: 1 }, c), false);
  });
});

test("remove answers true once and false the second time", async () => {
  await inRollback(async (c: PoolClient) => {
    const attempt = await anAttempt(c);
    await settlements.create(
      {
        id: attempt.id, attempt_id: attempt.id, settled_amount: 100,
        provider: "stripe", provider_ref: attempt.provider_ref,
      },
      c
    );
    assert.equal(await settlements.remove(attempt.id, c), true);
    assert.equal(await settlements.remove(attempt.id, c), false);
  });
});
