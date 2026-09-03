// payments.attempts, against real Postgres, every test rolled back.
//
// An attempt is the only row carrying a reference issued by a provider, so
// findByProviderRef is what every webhook resolves through.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#db";
import * as intents from "#db/payments/intents/repo.ts";
import * as attempts from "#db/payments/attempts/repo.ts";

let client: PoolClient;

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
  client = await pool.connect();
});
afterAll(async () => { client.release(); await pool.end(); });

async function inRollback(fn: (c: PoolClient) => Promise<void>) {
  await client.query("BEGIN");
  try { await fn(client); } finally { await client.query("ROLLBACK"); }
}

const anIntent = async (c: PoolClient) => {
  const { rows } = await c.query("SELECT id FROM exchange.users ORDER BY id LIMIT 1");
  return await intents.create(
    {
      session_id: randomUUID(), user_id: rows[0].id, type: "checkout",
      status: "requires_payment_method", amount_expected: 100,
    },
    c
  );
};

test("an attempt is created against its intent and found by the provider's reference", async () => {
  await inRollback(async (c: PoolClient) => {
    const intent = await anIntent(c);
    const provider_ref = `pi_${randomUUID().slice(0, 12)}`;

    const attempt = await attempts.create(
      {
        id: intent.id, intent_id: intent.id, provider: "stripe",
        provider_ref, amount: 100, status: "requires_payment_method",
      },
      c
    );
    assert.equal(attempt.intent_id, intent.id);

    const found = await attempts.findByProviderRef(provider_ref, c);
    assert.equal(found?.id, attempt.id);
    assert.equal((await attempts.listFor(intent.id, c)).length, 1);
    assert.equal(await attempts.findByProviderRef(`pi_${randomUUID()}`, c), undefined);
  });
});

test("update answers true for a real id and false for one with no attempt", async () => {
  await inRollback(async (c: PoolClient) => {
    const intent = await anIntent(c);
    const attempt = await attempts.create(
      {
        id: intent.id, intent_id: intent.id, provider: "stripe",
        provider_ref: `pi_${randomUUID().slice(0, 12)}`, amount: 100,
        status: "requires_payment_method",
      },
      c
    );

    assert.equal(await attempts.update(attempt.id, { status: "succeeded" }, c), true);
    const after = await attempts.getOne(attempt.id, c);
    assert.equal(after?.status, "succeeded");
    assert.equal(Number(after?.amount), 100, "an unnamed column was overwritten");

    assert.equal(await attempts.update(randomUUID(), { status: "succeeded" }, c), false);
  });
});

test("remove answers true once and false the second time", async () => {
  await inRollback(async (c: PoolClient) => {
    const intent = await anIntent(c);
    await attempts.create(
      {
        id: intent.id, intent_id: intent.id, provider: "stripe",
        provider_ref: `pi_${randomUUID().slice(0, 12)}`, amount: 100, status: "open",
      },
      c
    );
    assert.equal(await attempts.remove(intent.id, c), true);
    assert.equal(await attempts.remove(intent.id, c), false);
  });
});
