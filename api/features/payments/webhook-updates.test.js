// What the Stripe webhook actually writes to exchange.payment_intents.
//
// WHY THIS FILE EXISTS. FOLLOWUPS records that three production intents were
// captured by Stripe while exchange still says `requires_payment_method` with
// `amount_received` null or 0 - $126.48 - and leaves the cause open: "either
// the deliveries are failing, or they are arriving and the handler is throwing
// after the response", to be settled from the Stripe dashboard's delivery log.
//
// There is a third possibility neither of those covers, and it is visible from
// the code alone: THE HANDLER RUNS, WRITES NOTHING, AND ANSWERS 200. Every
// branch of features/payments/controller.js ends at `res.json({received:true})`
// whether the UPDATE matched a row or not, and repo.exchange.updatePaymentIntent
// is an UPDATE ... WHERE payment_intent_id = $6 with no upsert and no rowCount
// check. A webhook for an intent exchange has no row for is a silent no-op that
// Stripe records as a successful delivery.
//
// That matters for what Jacob does next: if this is the cause, THE DELIVERY LOG
// WILL SHOW EVERY DELIVERY SUCCEEDING, and the question FOLLOWUPS defers to it
// cannot be answered there. `audit:payments` reports 20 intents in the Stripe
// export with no row in exchange at all, which is the population this happens to.
//
// These tests assert the current behaviour rather than the desired behaviour -
// they are here so that a fix has something to change, and so the no-op is
// recorded as measured rather than as reasoned about.
//
// NOTHING IS COMMITTED: every statement takes the pinned client, so it is
// inside the transaction shared/testing/pinned-pool.js rolls back. The service
// wrapper is deliberately NOT used - updateIntentFromWebhook calls the repo
// with no executor, so it would open its own pool connection and commit to dev.
import test from "node:test";
import assert from "node:assert/strict";
import * as repo from "#features/payments/repo.exchange.js";
import * as service from "#features/payments/service.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.js";
import query from "#shared/db/query.js";

// Safe columns only. This table also carries `routing` and `last_four` for
// us_bank_account instruments, and those are never selected or printed.
const READ = `SELECT payment_status, amount, amount_received, amount_capturable,
                     method_id
              FROM exchange.payment_intents WHERE payment_intent_id = $1`;

async function seedSettledIntent(c, id) {
  await query(
    `INSERT INTO exchange.payment_intents
       (type, payment_intent_id, payment_status, amount, amount_received,
        amount_capturable, method_id)
     VALUES ('order', $1, 'succeeded', 5178, 5178, 0, 'pm_seeded')`,
    [id],
    c
  );
}

test("a charge.* webhook updates nothing, because a charge is not an intent", async () => {
  await inPinnedTransaction(async (c) => {
    const id = `pi_test_charge_${Date.now()}`;
    await seedSettledIntent(c, id);

    // This is exactly what controller.js passes for charge.succeeded,
    // charge.captured, charge.updated, charge.pending and charge.failed:
    // `event.data.object`, which for those five events is a CHARGE. A charge's
    // id is `ch_...`, and the UPDATE keys on payment_intent_id, so it matches
    // no row. A charge also has no amount_received and no amount_capturable -
    // repairing this by keying on charge.payment_intent instead would write
    // NULL over a settled amount, so the id is not the only thing wrong with it.
    const charge = {
      id: `ch_test_${Date.now()}`,
      payment_intent: id,
      status: "succeeded",
      amount: 5178,
      payment_method: "pm_from_charge",
    };
    await repo.updatePaymentIntent(charge, c);

    const { rows } = await query(READ, [id], c);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].payment_status, "succeeded", "unchanged");
    assert.equal(Number(rows[0].amount_received), 5178, "unchanged");
    assert.equal(rows[0].method_id, "pm_seeded", "not overwritten from the charge");

    // And the charge's own id did not become a row either.
    const { rows: byChargeId } = await query(READ, [charge.id], c);
    assert.equal(byChargeId.length, 0, "no row is created for a charge id");
  });
});

test("a webhook for an intent exchange has no row for writes nothing, and says so", async () => {
  await inPinnedTransaction(async (c) => {
    const before = await query(`SELECT count(*)::int AS n FROM exchange.payment_intents`, [], c);

    // audit:payments reports 20 of these in production. createPaymentIntent is
    // what inserts the row, so an intent opened any other way - or one whose
    // insert failed - never gets one, and every webhook after it lands here.
    const matched = await repo.updatePaymentIntent(
      {
        id: `pi_test_absent_${Date.now()}`,
        status: "succeeded",
        amount: 11480,
        amount_received: 11480,
        amount_capturable: 0,
        payment_method: "pm_x",
      },
      c
    );

    const after = await query(`SELECT count(*)::int AS n FROM exchange.payment_intents`, [], c);
    assert.equal(after.rows[0].n, before.rows[0].n, "no row inserted - it is an UPDATE");

    // D24. The repo still does not throw - it REPORTS, and the service turns
    // that into a refusal so Stripe retries. Keeping the signal here rather
    // than the throw means the repo stays usable from a backfill or a script
    // that legitimately does not care.
    assert.equal(matched, false, "the repo did not report that nothing matched");
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
            amount_capturable: 0,
            payment_method: "pm_x",
          },
        }),
      (err) => {
        assert.equal(err.statusCode, 500, `expected 500 so Stripe retries, got ${err.statusCode}`);
        assert.match(err.message, /no payment intent row/);
        return true;
      }
    );
  });
});

// The other side of it: a webhook that DOES match must still be accepted, or
// every delivery would retry for days.
test("the service accepts a webhook that matches an intent", async () => {
  await inPinnedTransaction(async (c) => {
    const existing = (
      await query(`SELECT payment_intent_id FROM exchange.payment_intents WHERE payment_intent_id IS NOT NULL LIMIT 1`, [], c)
    ).rows[0];
    assert.ok(existing, "dev has no payment intent to match against");

    await service.updateIntentFromWebhook({
      paymentIntent: {
        id: existing.payment_intent_id,
        status: "succeeded",
        amount: 11480,
        amount_received: 11480,
        amount_capturable: 0,
        payment_method: "pm_x",
      },
    });
  });
});

test("a late payment_failed overwrites a settled intent, and Stripe does not guarantee order", async () => {
  await inPinnedTransaction(async (c) => {
    const id = `pi_test_order_${Date.now()}`;
    await seedSettledIntent(c, id);

    // A customer whose first attempt failed and whose second succeeded produces
    // payment_failed THEN succeeded. Stripe delivers webhooks without an
    // ordering guarantee, and this UPDATE has no guard - no status precedence,
    // no event timestamp, no `WHERE updated_at < ...`. Delivered in the wrong
    // order, the failure wins, and the row ends up saying exactly what the
    // three production rows say: requires_payment_method, amount_received 0.
    await repo.updatePaymentIntent(
      {
        id,
        status: "requires_payment_method",
        amount: 5178,
        amount_received: 0,
        amount_capturable: 0,
        payment_method: null,
      },
      c
    );

    const { rows } = await query(READ, [id], c);
    assert.equal(rows[0].payment_status, "requires_payment_method");
    assert.equal(Number(rows[0].amount_received), 0);
    assert.equal(rows[0].method_id, null, "the instrument is cleared too");
  });
});
