// payments.intents, against real Postgres, every test rolled back.
//
// There is no Stripe client here and no network call. What is checked is the
// bookkeeping around a payment: which row an update lands on, and which intents
// are considered reusable - because reusing a settled intent is how a customer
// gets charged twice.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#db";
import * as intents from "#db/payments/intents/repo.ts";
import * as attempts from "#db/payments/attempts/repo.ts";

let client: PoolClient;

before(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
  client = await pool.connect();
});

after(async () => {
  client.release();
  await pool.end();
});

async function inRollback(fn: (c: PoolClient) => Promise<void>) {
  await client.query("BEGIN");
  try {
    await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

const aUser = async (c: PoolClient) =>
  (await c.query("SELECT id FROM exchange.users ORDER BY id LIMIT 1")).rows[0].id;

// Every fixture gets its own session id. payments.intents.session_id carries no
// foreign key - the session is better-auth's fact, not this schema's - so a
// fresh uuid is enough to keep one file's rows out of another's.
const anIntent = async (
  c: PoolClient,
  over: Partial<intents.NewIntent> = {},
  provider_ref = `pi_${randomUUID().slice(0, 12)}`
) => {
  const intent = await intents.create(
    {
      session_id: over.session_id ?? randomUUID(),
      user_id: over.user_id ?? (await aUser(c)),
      type: over.type ?? "checkout",
      status: over.status ?? "requires_payment_method",
      amount_expected: over.amount_expected ?? 100,
    },
    c
  );
  await attempts.create(
    {
      id: intent.id,
      intent_id: intent.id,
      provider: "stripe",
      provider_ref,
      amount: intent.amount_expected,
      status: intent.status,
    },
    c
  );
  return { intent, provider_ref };
};

test("create returns the row it wrote, and getOne reads it back", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const { intent } = await anIntent(c, { user_id: user, type: "checkout" });

    assert.equal(intent.user_id, user);
    assert.equal(intent.type, "checkout");
    assert.equal(Number(intent.amount_expected), 100);

    const read = await intents.getOne(intent.id, c);
    assert.equal(read?.id, intent.id);
    assert.equal(read?.status, "requires_payment_method");
  });
});

test("update answers true for a real id and writes only the named columns", async () => {
  await inRollback(async (c: PoolClient) => {
    const { intent } = await anIntent(c);

    const changed = await intents.update(intent.id, { status: "succeeded" }, c);
    assert.equal(changed, true, "update reported no row changed");

    const after = await intents.getOne(intent.id, c);
    assert.equal(after?.status, "succeeded");
    assert.equal(
      Number(after?.amount_expected), 100, "an unnamed column was overwritten"
    );
  });
});

test("update answers false for an id with no intent row", async () => {
  await inRollback(async (c: PoolClient) => {
    const changed = await intents.update(randomUUID(), { status: "canceled" }, c);
    assert.equal(changed, false, "update reported a change for an intent that does not exist");
  });
});

test("an update lands on the named intent and no other", async () => {
  await inRollback(async (c: PoolClient) => {
    const mine = await anIntent(c);
    const other = await anIntent(c);

    await intents.update(mine.intent.id, { status: "succeeded", amount_expected: 250 }, c);

    const untouched = await intents.getOne(other.intent.id, c);
    assert.equal(untouched?.status, "requires_payment_method");
    assert.equal(Number(untouched?.amount_expected), 100);
  });
});

test("remove answers true once and false the second time", async () => {
  await inRollback(async (c: PoolClient) => {
    const { intent } = await anIntent(c);
    await attempts.remove(intent.id, c);
    assert.equal(await intents.remove(intent.id, c), true);
    assert.equal(await intents.remove(intent.id, c), false);
  });
});

test("an open intent is found again for the same session, user and type", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const session_id = randomUUID();
    const { provider_ref } = await anIntent(c, { user_id: user, session_id });

    // The provider's id for the intent is on the ATTEMPT rather than at the top
    // level, and that is the wire shape too.
    const found = await intents.findReusable(
      { session_id, user_id: user, type: "checkout" }, c
    );
    assert.equal(found?.attempt?.provider_ref, provider_ref);
    assert.equal(
      (found as unknown as Record<string, unknown>)?.payment_intent_id,
      undefined,
      "the legacy names leaked into the repo"
    );
  });
});

// The filter that stops a customer being charged twice.
for (const status of ["succeeded", "processing", "canceled"]) {
  test(`an intent that is ${status} is not offered for reuse`, async () => {
    await inRollback(async (c: PoolClient) => {
      const user = await aUser(c);
      const session_id = randomUUID();
      await anIntent(c, { user_id: user, session_id, status });

      const found = await intents.findReusable(
        { session_id, user_id: user, type: "checkout" }, c
      );
      assert.equal(found, undefined, `a ${status} intent was offered for reuse`);
    });
  });
}

test("an intent for a different type is not reused", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const session_id = randomUUID();
    await anIntent(c, { user_id: user, session_id, type: "checkout" });

    const found = await intents.findReusable(
      { session_id, user_id: user, type: "admin" }, c
    );
    assert.equal(found, undefined);
  });
});

// The amount is in CENTS here and dollars everywhere else, because the caller
// compares it against Math.round(dollars * 100).
test("the payment facts resolve by the provider's reference, in cents", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const { intent, provider_ref } = await anIntent(c, { user_id: user });

    const facts = await intents.findFactsByRef(provider_ref, c);
    assert.equal(facts?.intent_id, intent.id);
    assert.equal(facts?.attempt_id, intent.id);
    assert.equal(facts?.user_id, user);
    assert.equal(Number(facts?.amount), 10000, "the facts are not in cents");
    assert.equal(facts?.sales_order_id, null);
    assert.equal(facts?.purchase_order_id, null);

    assert.equal(await intents.findFactsByRef(`pi_${randomUUID()}`, c), undefined);
  });
});

test("a payment write on a client is invisible on another connection", async () => {
  const other = await pool.connect();
  await client.query("BEGIN");
  try {
    const { provider_ref } = await anIntent(client);

    const inside = await client.query(
      "SELECT 1 FROM payments.attempts WHERE provider_ref = $1", [provider_ref]
    );
    assert.equal(inside.rows.length, 1, "the write did not happen at all");

    const seen = await other.query(
      "SELECT 1 FROM payments.attempts WHERE provider_ref = $1", [provider_ref]
    );
    assert.equal(seen.rows.length, 0, "an uncommitted payment intent was visible elsewhere");
  } finally {
    await client.query("ROLLBACK");
    other.release();
  }
});
