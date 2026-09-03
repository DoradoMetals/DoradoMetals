// Phase 9: the order exists before the money moves, and the pieces that make
// that safe. Runs against real Postgres inside the pinned transaction, so the
// services can be called exactly as production calls them - no executor
// threading - and nothing survives the rollback.
//
// WHAT IS DELIBERATELY NOT COVERED: the branch of createSalesOrder that takes
// an OPEN intent (requires_confirmation and friends) calls
// stripeProvider.updateIntent, which is a real network call to Stripe, and a
// test suite must not charge the internet. Every refusal branch and the
// succeeded-intent repair path exit before that call, so they are all
// exercised here; the provider branch itself is six lines whose failure mode
// is a thrown error and no order.
import test from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import query from "#shared/db/query.ts";
import { LOCKS } from "#shared/testing/locks.ts";

// EVERY PINNED TRANSACTION IN THIS FILE TAKES THE BALANCE LOCK. A balance write
// is two row locks - exchange.users, and auth.users through migration 107's
// mirror trigger - so files that move balances agree an order rather than
// deadlocking on whichever customer each visited first. See LOCKS.USERS.
const inPinned = <T,>(fn: (c: import("pg").PoolClient) => Promise<T> | T): Promise<T> =>
  inPinnedTransaction(fn, { lock: [LOCKS.USERS, LOCKS.ORDERS] });

import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";
import * as ordersRepo from "#db/orders/repo.ts";
import * as place from "#domain/orders/place.ts";
import * as paymentsService from "#domain/payments/service.ts";
import * as sweeps from "#domain/payments/sweeps.ts";
import { calculateSalesOrderTotal } from "#domain/pricing/ask.ts";
import * as productService from "#domain/products/service.ts";
import * as taxService from "#domain/sales-tax/service.ts";
import * as spotsService from "#domain/spots/service.ts";

test.before(async () => { await mockSessions(); });
test.after(() => { restoreSessions(); });

// A sales order seeded minimally - the flair touches only id/status, and the
// table requires only `number` beyond its defaults (checked, not guessed).
// NATIVE ONLY since D212: exchange.sales_orders receives nothing any more.
async function seedSale(c: PoolClient, status: string): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO orders.orders (direction, status, number)
     VALUES ('sale', $1, nextval('orders.sale_number_seq'))
     RETURNING id`,
    [status], c
  );
  return rows[0]!.id;
}

// A native intent+attempt pair. `cents` is the seed's own unit (the Stripe
// shape); payments.intents stores dollars.
async function seedIntent(
  c: PoolClient,
  provider_ref: string,
  over: {
    status?: string; cents?: number; settledCents?: number;
    user_id?: string | null; order_id?: string | null;
  } = {}
): Promise<void> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO payments.intents (type, status, amount_expected, user_id, order_id)
     VALUES ('order', $1, $2, $3, $4) RETURNING id`,
    [
      over.status ?? "requires_confirmation",
      (over.cents ?? 5178) / 100,
      over.user_id ?? null,
      over.order_id ?? null,
    ], c
  );
  await query(
    `INSERT INTO payments.attempts (id, intent_id, provider, provider_ref, amount, status)
     VALUES ($1, $1, 'stripe', $2, $3, $4)`,
    [rows[0]!.id, provider_ref, (over.cents ?? 5178) / 100, over.status ?? "requires_confirmation"], c
  );
  if ((over.settledCents ?? 0) > 0) {
    await query(
      `INSERT INTO payments.settlements (id, attempt_id, settled_amount, provider, provider_ref, settled_at)
       VALUES ($1, $1, $2, 'stripe', $3, now())`,
      [rows[0]!.id, (over.settledCents as number) / 100, provider_ref], c
    );
  }
}

async function statusOf(c: PoolClient, id: string) {
  const native = await query<{ status: string }>(
    `SELECT status FROM orders.orders WHERE id = $1`, [id], c);
  return { native: native.rows[0]?.status };
}

test("the flair stamp relabels from anywhere - a label, never a gate (D211: flair)", async () => {
  await inPinned(async (c: PoolClient) => {
    const id = await seedSale(c, "Pending");
    await ordersRepo.update(id, { status: "Preparing" }, {}, c);
    assert.deepEqual(await statusOf(c, id), { native: "Preparing" });

    // Unconditional by design - the label is COSMETIC, and the no-stomp
    // property lives at the payments layer (the transition gate), not here.
    const relabelled = await seedSale(c, "Completed");
    await ordersRepo.update(relabelled, { status: "Preparing" }, {}, c);
    assert.deepEqual(await statusOf(c, relabelled), { native: "Preparing" });
  });
});

test("a webhook RETRY does not stomp an admin's later label - by payment fact, not status", async () => {
  await inPinned(async (c: PoolClient) => {
    const orderId = await seedSale(c, "Pending");
    const pi = `pi_p9_retry_${Date.now()}`;
    await seedIntent(c, pi, { order_id: orderId });

    // The real settlement: the stored intent was not succeeded -> the label
    // refreshes.
    await paymentsService.updateIntentFromWebhook({
      paymentIntent: { id: pi, status: "succeeded", amount: 5178, amount_received: 5178 },
    });
    assert.deepEqual(await statusOf(c, orderId), { native: "Preparing" });

    // The admin works the order on...
    await query(`UPDATE orders.orders SET status = 'Completed' WHERE id = $1`, [orderId], c);
    await query(`UPDATE orders.orders SET status = 'Completed' WHERE id = $1`, [orderId], c);

    // ...and Stripe redelivers. The stored intent is ALREADY succeeded - no
    // transition, no label write. The admin's label survives by fact.
    await paymentsService.updateIntentFromWebhook({
      paymentIntent: { id: pi, status: "succeeded", amount: 5178, amount_received: 5178 },
    });
    assert.deepEqual(await statusOf(c, orderId), { native: "Completed" });
  });
});

// ---------------------------------------------------------------- the webhook

test("payment_intent.succeeded advances the order the intent is attached to", async () => {
  await inPinned(async (c: PoolClient) => {
    const orderId = await seedSale(c, "Pending");
    const pi = `pi_p9_webhook_${Date.now()}`;
    await seedIntent(c, pi, { order_id: orderId });

    await paymentsService.updateIntentFromWebhook({
      paymentIntent: { id: pi, status: "succeeded", amount: 5178, amount_received: 5178 },
    });

    assert.deepEqual(await statusOf(c, orderId), { native: "Preparing" });
  });
});

test("payment_intent.processing does NOT advance the order", async () => {
  await inPinned(async (c: PoolClient) => {
    const orderId = await seedSale(c, "Pending");
    const pi = `pi_p9_processing_${Date.now()}`;
    await seedIntent(c, pi, { order_id: orderId });

    await paymentsService.updateIntentFromWebhook({
      paymentIntent: { id: pi, status: "processing", amount: 5178, amount_received: 0 },
    });

    assert.deepEqual(await statusOf(c, orderId), { native: "Pending" });
  });
});

// --------------------------------------------- creation verifies the intent

// A real customer with a real address, and a real displayed product - the
// pricing pipeline runs for real, so the tests compare against what the
// server actually computes rather than a number invented here.
async function fixtures(c: PoolClient) {
  const { rows: pair } = await query<{ user_id: string; address_id: string }>(
    `SELECT ua.user_id, ua.address_id
       FROM places.user_addresses ua
       JOIN auth.users u ON u.id = ua.user_id
      ORDER BY ua.address_id LIMIT 1`, [], c
  );
  if (!pair.length) return null;
  // A product WITH a metal: insertLines refuses one whose metal cannot be
  // resolved (by design), so a metal-less fixture tests the wrong refusal.
  const { rows: product } = await query<{ id: string }>(
    `SELECT b.id FROM products.bullion b
       JOIN metals.metals m ON m.id = b.metal_id
      WHERE b.display = true LIMIT 1`, [], c
  );
  if (!product.length) return null;
  return { user_id: pair[0]!.user_id, address_id: pair[0]!.address_id, product_id: product[0]!.id };
}

const bodyFor = (f: { address_id: string; product_id: string }, using_funds = false) => ({
  address: { id: f.address_id },
  items: [{ id: f.product_id, quantity: 1 }],
  using_funds,
  service: { value: "STANDARD", label: "Standard" },
  payment_method: "CARD",
});

async function pricedCents(c: PoolClient, f: { address_id: string; product_id: string; user_id: string }) {
  const { rows: state } = await query<{ state: string }>(
    `SELECT state FROM places.addresses WHERE id = $1`, [f.address_id], c);
  const items = await productService.getItemsFromServer([{ id: f.product_id, quantity: 1 }]);
  const spots = await spotsService.getSpotPrices();
  const taxed = await taxService.attachSalesTaxToItems(state[0]!.state, items, spots);
  const prices = calculateSalesOrderTotal(taxed, false, spots, { dorado_funds: 0 }, "STANDARD", "CARD");
  return Math.round(prices.post_charges_amount * 100);
}

const statusCodeOf = (err: unknown) => (err as { statusCode?: number }).statusCode;

test("an order with a charge refuses to exist without a payment intent", async () => {
  await inPinned(async (c: PoolClient) => {
    const f = await fixtures(c);
    assert.ok(f, "the test db has no user+address+product to price against");
    await as({ id: f.user_id }, () =>
      assert.rejects(
        () => place.placeSale({
            sales_order: bodyFor(f) as never,
            payment_intent_id: "",
            user: { id: f.user_id },
          }),
        (e: unknown) => statusCodeOf(e) === 400
      )
    );
  });
});

test("somebody else's payment intent is refused as if it did not exist", async () => {
  await inPinned(async (c: PoolClient) => {
    const f = await fixtures(c);
    assert.ok(f, "no fixtures");
    const pi = `pi_p9_theirs_${Date.now()}`;
    await seedIntent(c, pi, { cents: 999999, user_id: null });
    await as({ id: f.user_id }, () =>
      assert.rejects(
        () => place.placeSale({
            sales_order: bodyFor(f) as never,
            payment_intent_id: pi,
            user: { id: f.user_id },
          }),
        (e: unknown) => statusCodeOf(e) === 403
      )
    );
  });
});

// WHETHER AN ATTACHED SALE MAY BE SUPERSEDED IS THE INTENT'S OWN PAYMENT
// FACT (D211), never a label. A SETTLED intent stays with the order it paid
// for - refusing here is what protects a paid order from being cancelled by
// a retry - and the label on that order is irrelevant flair.
test("a SETTLED intent already attached to an order refuses a second one", async () => {
  await inPinned(async (c: PoolClient) => {
    const f = await fixtures(c);
    assert.ok(f, "no fixtures");
    // Labelled Pending ON PURPOSE: under the old status-driven rule this
    // label made the paid order supersedable. The payment fact wins now.
    const paid = await seedSale(c, "Pending");
    const pi = `pi_p9_attached_${Date.now()}`;
    await seedIntent(c, pi, {
      status: "succeeded", cents: 999999, settledCents: 999999,
      user_id: f.user_id, order_id: paid,
    });
    await as({ id: f.user_id }, () =>
      assert.rejects(
        () => place.placeSale({
            sales_order: bodyFor(f) as never,
            payment_intent_id: pi,
            user: { id: f.user_id },
          }),
        (e: unknown) => statusCodeOf(e) === 409
      )
    );
    assert.equal(
      (await statusOf(c, paid)).native, "Pending",
      "the paid order was touched by the refused retry"
    );
  });
});

// The other half of the fact: an UNSETTLED attached sale is superseded
// whatever its label says - an admin's label carries no payment meaning. The
// full creation retry needs a live provider intent (the sandbox lane's
// subject); the supersede MECHANICS are the reconciler helper's, driven here
// directly.
test("an unsettled sale is superseded by fact, whatever its label says", async () => {
  await inPinned(async (c: PoolClient) => {
    const id = await seedSale(c, "Preparing");
    const result = await sweeps.cancelPendingSale(id, c);
    assert.equal(result.order_id, id);
    assert.deepEqual(await statusOf(c, id), { native: "Cancelled" });
  });
});

// THE D179 REPAIR PATH: the customer PAID and order creation failed; on retry
// the intent arrives already succeeded and unattached. If it still matches the
// server's price to the cent, the order is created and born Preparing - the
// money is real and there is nothing left to await.
test("a paid-but-orderless intent is honoured: the order is created already Preparing", async () => {
  await inPinned(async (c: PoolClient) => {
    const f = await fixtures(c);
    assert.ok(f, "no fixtures");
    const cents = await pricedCents(c, f);
    assert.ok(cents > 0, "the fixture order priced to zero, which defeats this test");
    const pi = `pi_p9_repair_${Date.now()}`;
    await seedIntent(c, pi, {
      status: "succeeded", cents, settledCents: cents, user_id: f.user_id,
    });

    const order = await as({ id: f.user_id }, () =>
      place.placeSale({
            sales_order: bodyFor(f) as never,
            payment_intent_id: pi,
            user: { id: f.user_id },
          })
    );
    assert.ok(order, "no order came back");
    const got = await statusOf(c, (order as { id: string }).id);
    assert.equal(got.native, "Preparing", "a PAID order was born awaiting payment");
  });
});

test("a paid intent at a DIFFERENT price than the cart is refused, naming support", async () => {
  await inPinned(async (c: PoolClient) => {
    const f = await fixtures(c);
    assert.ok(f, "no fixtures");
    const cents = await pricedCents(c, f);
    const pi = `pi_p9_stale_${Date.now()}`;
    await seedIntent(c, pi, {
      status: "succeeded", cents: cents + 12345, settledCents: cents + 12345,
      user_id: f.user_id,
    });
    await as({ id: f.user_id }, () =>
      assert.rejects(
        () => place.placeSale({
            sales_order: bodyFor(f) as never,
            payment_intent_id: pi,
            user: { id: f.user_id },
          }),
        (e: unknown) => statusCodeOf(e) === 409 && /support/.test(String((e as Error).message))
      )
    );
  });
});

// THE LABEL DERIVES FROM THE MONEY FACT: nothing left to charge means nothing
// to await, whatever the payment method was called. The old code keyed on
// `payment_method === "CREDIT"` and got exactly this case - full coverage via
// using_funds - wrong.
test("an order fully covered by credit is born Preparing, with no intent attached", async () => {
  await inPinned(async (c: PoolClient) => {
    const f = await fixtures(c);
    assert.ok(f, "no fixtures");
    // The credit balance is read off the SESSION user (pricing takes
    // session.user.dorado_funds), so the fixture carries it there - and the
    // table is updated too, because removeFunds debits the row.
    await query(
      `UPDATE exchange.users SET dorado_funds = 10000000 WHERE id = $1`,
      [f.user_id], c
    );
    const order = await as({ id: f.user_id, dorado_funds: 10000000 }, () =>
      place.placeSale({
        sales_order: bodyFor(f, true) as never,
        payment_intent_id: "",
        user: { id: f.user_id, dorado_funds: 10000000 },
      })
    );
    assert.ok(order, "no order came back");
    const got = await statusOf(c, (order as { id: string }).id);
    assert.equal(got.native, "Preparing", "a fully-paid order was born awaiting payment");
  });
});
