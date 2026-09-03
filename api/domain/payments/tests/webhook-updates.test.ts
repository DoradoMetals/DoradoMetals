// What the Stripe webhook actually writes to payments.intents / attempts /
// settlements - the native record since the D212 flip.
//
// WHY THIS FILE EXISTS. FOLLOWUPS records that three production intents were
// captured by Stripe while the local row still said `requires_payment_method`
// - $126.48 - and the cause the code alone makes visible is THE HANDLER RUNS,
// WRITES NOTHING, AND ANSWERS 200: updatePaymentIntent is an UPDATE keyed on
// the provider's reference, and a webhook for an intent with no row is a
// silent no-op Stripe records as a successful delivery. D24 turned that into
// a refusal at the service so Stripe retries; the repo REPORTS (returns
// false) rather than throwing, so a backfill that legitimately does not care
// can still use it.
//
// NOTHING IS COMMITTED: every statement takes the pinned client, so it is
// inside the transaction shared/testing/pinned-pool.js rolls back.
import test from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import * as service from "#domain/payments/service.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import query from "#shared/db/query.ts";

const READ = `SELECT i.status, i.amount_expected, st.settled_amount
                FROM payments.intents i
                JOIN payments.attempts a ON a.intent_id = i.id
                LEFT JOIN payments.settlements st ON st.attempt_id = a.id
               WHERE a.provider_ref = $1`;

async function seedSettledIntent(c: PoolClient, provider_ref: string) {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO payments.intents (type, status, amount_expected)
     VALUES ('order', 'succeeded', 51.78) RETURNING id`,
    [],
    c
  );
  await query(
    `INSERT INTO payments.attempts (id, intent_id, provider, provider_ref, amount, status)
     VALUES ($1, $1, 'stripe', $2, 51.78, 'succeeded')`,
    [rows[0]!.id, provider_ref],
    c
  );
  await query(
    `INSERT INTO payments.settlements (id, attempt_id, settled_amount, provider, provider_ref, settled_at)
     VALUES ($1, $1, 51.78, 'stripe', $2, now())`,
    [rows[0]!.id, provider_ref],
    c
  );
}

test("a charge.* webhook updates nothing, because a charge is not an intent", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const id = `pi_test_charge_${Date.now()}`;
    await seedSettledIntent(c, id);

    // This is exactly what controller.js passes for charge.succeeded,
    // charge.captured, charge.updated, charge.pending and charge.failed:
    // `event.data.object`, which for those five events is a CHARGE. A charge's
    // id is `ch_...`, and the UPDATE keys on the attempt's provider_ref, so it
    // matches no row.
    const charge = {
      id: `ch_test_${Date.now()}`,
      status: "succeeded",
      amount: 5178,
    };
    const matched = await service.updateFromProvider(charge, c);
    assert.equal(matched, false, "a charge id matched an intent");

    const { rows } = await query(READ, [id], c);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "succeeded", "unchanged");
    assert.equal(Number(rows[0].settled_amount), 51.78, "unchanged");

    // And the charge's own id did not become a row either.
    const { rows: byChargeId } = await query(READ, [charge.id], c);
    assert.equal(byChargeId.length, 0, "no row is created for a charge id");
  });
});

test("a webhook for an intent with no row writes nothing, and says so", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const before = await query(`SELECT count(*)::int AS n FROM payments.intents`, [], c);

    const matched = await service.updateFromProvider(
      {
        id: `pi_test_absent_${Date.now()}`,
        status: "succeeded",
        amount: 11480,
        amount_received: 11480,
      },
      c
    );

    const after = await query(`SELECT count(*)::int AS n FROM payments.intents`, [], c);
    assert.equal(after.rows[0].n, before.rows[0].n, "no row inserted - it is an UPDATE");

    // D24. updateFromProvider REPORTS rather than throwing; the webhook entry
    // turns that into a refusal so Stripe retries.
    assert.equal(matched, false, "nothing reported that no row matched");
  });
});

// D24, the half that changes what Stripe sees. Before this, an intent with no
// row was accepted with `{received:true}` and the money event was lost while
// the delivery log said it went fine - which is why the delivery log could
// never show the missing $126.48.
test("the service refuses a webhook that matches no intent, so Stripe retries", async () => {
  await inPinnedTransaction(async () => {
    await assert.rejects(
      () =>
        service.updateIntentFromWebhook({
          paymentIntent: {
            id: `pi_test_absent_${Date.now()}`,
            status: "succeeded",
            amount: 11480,
            amount_received: 11480,
          },
        }),
      (err: unknown) => {
        const e = err as { statusCode?: number; message?: string; code?: string };
        assert.equal(e.statusCode, 500, `expected 500 so Stripe retries, got ${e.statusCode}`);
        assert.match(String(e.message), /no payment intent row/);
        return true;
      }
    );
  });
});

// The other side of it: a webhook that DOES match must still be accepted, or
// every delivery would retry for days.
test("the service accepts a webhook that matches an intent", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const id = `pi_test_matched_${Date.now()}`;
    await seedSettledIntent(c, id);

    await service.updateIntentFromWebhook({
      paymentIntent: {
        id,
        status: "succeeded",
        amount: 11480,
        amount_received: 11480,
      },
    });

    const { rows } = await query(READ, [id], c);
    assert.equal(Number(rows[0].amount_expected), 114.8, "the update did not land");
  });
});

test("a late payment_failed overwrites a settled intent, and Stripe does not guarantee order", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const id = `pi_test_order_${Date.now()}`;
    await seedSettledIntent(c, id);

    // A customer whose first attempt failed and whose second succeeded produces
    // payment_failed THEN succeeded. Stripe delivers webhooks without an
    // ordering guarantee, and this UPDATE has no guard - no status precedence,
    // no event timestamp. Delivered in the wrong order, the failure wins, and
    // the intent's status ends up saying exactly what the three production
    // rows said. The SETTLEMENT survives, because a settlement records money
    // that moved and nothing un-moves it - the improvement over exchange,
    // where amount_received was stomped back to 0.
    await service.updateFromProvider(
      {
        id,
        status: "requires_payment_method",
        amount: 5178,
        amount_received: 0,
      },
      c
    );

    const { rows } = await query(READ, [id], c);
    assert.equal(rows[0].status, "requires_payment_method");
    assert.equal(Number(rows[0].settled_amount), 51.78, "the settlement is a durable fact");
  });
});
