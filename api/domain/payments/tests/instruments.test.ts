import { test } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import * as webhook from "#domain/payments/webhook.ts";
import * as details from "#db/payments/details/repo.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { aUser } from "#shared/testing/builders/index.ts";
import query from "#shared/db/query.ts";

const aCard = (provider_ref: string) => ({
  id: provider_ref,
  type: "card",
  card: { last4: "4242", brand: "visa" },
});

const instruments = (pm: { id: string }): typeof webhook.LIVE =>
  ({ retrieve: async () => aCard(pm.id), confirm: async () => {} });

async function anIntentFor(
  c: PoolClient, user_id: string, provider_ref: string
): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO payments.intents (user_id, type, status, amount_expected)
     VALUES ($1, 'order', 'requires_confirmation', 51.78) RETURNING id`,
    [user_id], c
  );
  const id = rows[0]!.id;
  await query(
    `INSERT INTO payments.attempts (id, intent_id, provider, provider_ref, amount, status)
     VALUES ($1, $1, 'stripe', $2, 51.78, 'requires_confirmation')`,
    [id, provider_ref], c
  );
  return id;
}

const instrumentRow = async (c: PoolClient, provider_ref: string) =>
  (await query<{ id: string; user_id: string; last_four: string | null; card_brand: string | null }>(
    `SELECT id, user_id, last_four, card_brand FROM payments.details
      WHERE provider = 'stripe' AND provider_ref = $1`,
    [provider_ref], c
  )).rows[0];

test("a first-sighting instrument is recorded against the customer the intent names", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const customer = await aUser(c);
    const pi = `pi_instr_${Date.now()}`;
    const pm = { id: `pm_instr_${Date.now()}` };
    await anIntentFor(c, customer.id, pi);

    await webhook.applyIntentEvent(
      { id: pi, status: "succeeded", amount: 5178, amount_received: 5178 },
      pm.id,
      instruments(pm)
    );

    const row = await instrumentRow(c, pm.id);
    assert.ok(row, "the instrument was not recorded at all - this used to throw instead");
    assert.equal(row.user_id, customer.id, "the instrument was attributed to somebody else");
    assert.equal(row.last_four, "4242");
    assert.equal(row.card_brand, "visa");
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.USERS] });
});

test("a second delivery of the same instrument rewrites the row rather than minting a second", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const customer = await aUser(c);
    const pi = `pi_instr_twice_${Date.now()}`;
    const pm = { id: `pm_instr_twice_${Date.now()}` };
    await anIntentFor(c, customer.id, pi);

    const event = { id: pi, status: "succeeded" as const, amount: 5178, amount_received: 5178 };
    await webhook.applyIntentEvent(event, pm.id, instruments(pm));
    await webhook.applyIntentEvent(event, pm.id, instruments(pm));

    const { rows } = await query(
      `SELECT id FROM payments.details WHERE provider = 'stripe' AND provider_ref = $1`,
      [pm.id], c
    );
    assert.equal(rows.length, 1, "the retry minted a duplicate instrument");
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.USERS] });
});

test("a payment_method event for an unknown instrument writes nothing and does not throw", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const pm = { id: `pm_orphan_${Date.now()}` };

    await webhook.applyMethodEvent(aCard(pm.id));

    assert.equal(await instrumentRow(c, pm.id), undefined, "an unattributable instrument was stored");
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.USERS] });
});

test("a payment_method event updates an instrument already on file", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const customer = await aUser(c);
    const pm = { id: `pm_known_${Date.now()}` };
    await details.create(
      customer.id,
      { provider: "stripe", provider_ref: pm.id, last_four: "0000", card_brand: "unknown" },
      c
    );

    await webhook.applyMethodEvent(aCard(pm.id));

    const row = await instrumentRow(c, pm.id);
    assert.equal(row?.last_four, "4242", "the known instrument was not refreshed");
    assert.equal(row?.card_brand, "visa");
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.USERS] });
});
