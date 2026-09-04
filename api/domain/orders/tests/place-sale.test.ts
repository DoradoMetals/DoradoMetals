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
import { test, beforeAll, afterAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import query from "#shared/db/query.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";

// EVERY PINNED TRANSACTION IN THIS FILE TAKES THE BALANCE LOCK. A balance write
// is two row locks - exchange.users, and auth.users through migration 107's
// mirror trigger - so files that move balances agree an order rather than
// deadlocking on whichever customer each visited first. See LOCKS.USERS.
const inPinned = <T,>(fn: (c: import("pg").PoolClient) => Promise<T> | T): Promise<T> =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: [LOCKS.USERS, LOCKS.ORDERS] });

import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";
import * as ordersRepo from "#db/orders/repo.ts";
import * as place from "#domain/orders/place.ts";
import * as paymentsWebhook from "#domain/payments/webhook.ts";
import * as sweeps from "#domain/payments/sweeps.ts";
import { calculateSalesOrderTotal } from "#domain/pricing/ask.ts";
import * as productService from "#domain/products/service.ts";
import * as taxService from "#domain/sales-tax/service.ts";
import * as spotsService from "#domain/spots/service.ts";

beforeAll(async () => { await mockSessions(); });
afterAll(() => { restoreSessions(); });

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
    await paymentsWebhook.applyIntentEvent({ id: pi, status: "succeeded", amount: 5178, amount_received: 5178 });
    assert.deepEqual(await statusOf(c, orderId), { native: "Preparing" });

    // The admin works the order on...
    await query(`UPDATE orders.orders SET status = 'Completed' WHERE id = $1`, [orderId], c);
    await query(`UPDATE orders.orders SET status = 'Completed' WHERE id = $1`, [orderId], c);

    // ...and Stripe redelivers. The stored intent is ALREADY succeeded - no
    // transition, no label write. The admin's label survives by fact.
    await paymentsWebhook.applyIntentEvent({ id: pi, status: "succeeded", amount: 5178, amount_received: 5178 });
    assert.deepEqual(await statusOf(c, orderId), { native: "Completed" });
  });
});

// ---------------------------------------------------------------- the webhook

test("payment_intent.succeeded advances the order the intent is attached to", async () => {
  await inPinned(async (c: PoolClient) => {
    const orderId = await seedSale(c, "Pending");
    const pi = `pi_p9_webhook_${Date.now()}`;
    await seedIntent(c, pi, { order_id: orderId });

    await paymentsWebhook.applyIntentEvent({ id: pi, status: "succeeded", amount: 5178, amount_received: 5178 });

    assert.deepEqual(await statusOf(c, orderId), { native: "Preparing" });
  });
});

test("payment_intent.processing does NOT advance the order", async () => {
  await inPinned(async (c: PoolClient) => {
    const orderId = await seedSale(c, "Pending");
    const pi = `pi_p9_processing_${Date.now()}`;
    await seedIntent(c, pi, { order_id: orderId });

    await paymentsWebhook.applyIntentEvent({ id: pi, status: "processing", amount: 5178, amount_received: 0 });

    assert.deepEqual(await statusOf(c, orderId), { native: "Pending" });
  });
});

// --------------------------------------------- creation reads the CHECKOUT
//
// THE BODY IS GONE (D214 item 11). `placeSale({sales_order, payment_intent_id,
// user})` took the browser's whole checkout document - the address, the cart
// lines, the delivery service, the payment method and a credit checkbox - plus
// an intent id it attached on trust. `place(checkout_id)` takes ONE id: the
// customer is the checkout row's own user_id, every choice is a column of that
// row, and the payment intent is the customer's own open one, resolved
// server-side. So these tests prime the ROW the way the stepper does.

// A real customer with a real address, and a real displayed product - the
// pricing pipeline runs for real, so the tests compare against what the
// server actually computes rather than a number invented here.
//
// THE CUSTOMER HAS NO PAYMENT INTENT OF THEIR OWN, which is what lets the
// "no intent" refusal below be asserted: the intent is resolved from the
// customer now, so a fixture user who already has one could never reach it.
async function fixtures(c: PoolClient) {
  const { rows: pair } = await query<{ user_id: string; address_id: string }>(
    `SELECT ua.user_id, ua.address_id
       FROM places.user_addresses ua
       JOIN auth.users u ON u.id = ua.user_id
      WHERE NOT EXISTS (SELECT 1 FROM payments.intents i WHERE i.user_id = ua.user_id)
      ORDER BY ua.address_id LIMIT 1`, [], c
  );
  if (!pair.length) return null;
  // A product WITH a metal: the line copy refuses one whose metal cannot be
  // resolved (by design), so a metal-less fixture tests the wrong refusal.
  const { rows: product } = await query<{ id: string }>(
    `SELECT b.id FROM products.bullion b
       JOIN metals.metals m ON m.id = b.metal_id
      WHERE b.display = true LIMIT 1`, [], c
  );
  if (!product.length) return null;
  return { user_id: pair[0]!.user_id, address_id: pair[0]!.address_id, product_id: product[0]!.id };
}

type Fixtures = NonNullable<Awaited<ReturnType<typeof fixtures>>>;

// The sale checkout, primed as the stepper leaves it: the delivery address,
// the delivery service and the payment method by ID, and the cart line.
async function primeSaleCheckout(c: PoolClient, f: Fixtures): Promise<string> {
  const { rows: [co] } = await query<{ id: string }>(
    `INSERT INTO checkout.checkouts (user_id, direction) VALUES ($1, 'sale')
     ON CONFLICT (user_id, direction) DO UPDATE SET user_id = EXCLUDED.user_id
     RETURNING id`, [f.user_id], c
  );
  await query(
    `UPDATE checkout.checkouts SET
       recipient_address_id = $2,
       carrier_service_id = (SELECT id FROM shipping.services
                              WHERE carrier_id IS NULL AND code = 'STANDARD' LIMIT 1),
       payment_method_id  = (SELECT id FROM payments.methods
                              WHERE direction = 'sale' AND type = 'CARD' LIMIT 1)
     WHERE id = $1`,
    [co!.id, f.address_id], c
  );
  // THE BALANCE IS PART OF THE PRICE NOW. Credit is applied whenever the
  // customer has any (D214 item 11), so a fixture that does not say what the
  // balance is prices differently from `pricedCents` below. Zeroed here; the
  // credit test raises it afterwards.
  //
  // WRITTEN TO auth.users, WHICH OWNS THE BALANCE SINCE MIGRATION 118. It used
  // to be exchange.users, back when 107's `mirror_funds_to_auth` trigger
  // carried the value across; 118 retired that trigger, so the same UPDATE
  // against exchange now sets a frozen column the price never reads.
  await query(`UPDATE auth.users SET dorado_funds = 0 WHERE id = $1`, [f.user_id], c);
  await query(`DELETE FROM checkout.items WHERE checkout_id = $1`, [co!.id], c);
  // The line snapshots its product, as the basket endpoint writes it.
  await query(
    `INSERT INTO checkout.items
       (checkout_id, bullion_id, metal_id, pre_melt, post_melt, purity, content, unit, quantity)
     SELECT $1, b.id, b.metal_id, b.gross, b.content, b.purity, b.content, 't oz', 1
       FROM products.bullion b WHERE b.id = $2`,
    [co!.id, f.product_id], c
  );
  return co!.id;
}

async function pricedCents(c: PoolClient, f: Fixtures) {
  const { rows: state } = await query<{ state: string }>(
    `SELECT state FROM places.addresses WHERE id = $1`, [f.address_id], c);
  const items = await productService.getItemsFromServer([{ id: f.product_id, quantity: 1 }]);
  const spots = await spotsService.getSpotPrices();
  const taxed = await taxService.attachSalesTaxToItems(state[0]!.state, items, spots);
  const prices = calculateSalesOrderTotal(taxed, spots, { dorado_funds: 0 }, "STANDARD", "CARD");
  return Math.round(prices.post_charges_amount * 100);
}

const kindOf = (err: unknown) => (err as { kind?: string }).kind;

// 422 (Invalid), NOT 400: a charge with no intent is a rule the domain
// refuses. The MESSAGE changed with the input - the body used to name an
// intent and could name none, and now the server looks for the customer's own.
test("an order with a charge refuses to exist without a payment intent", async () => {
  await inPinned(async (c: PoolClient) => {
    const f = await fixtures(c);
    assert.ok(f, "the test db has no intent-free user+address+product to price against");
    const checkout_id = await primeSaleCheckout(c, f);
    await assert.rejects(
      () => place.place(checkout_id),
      (e: unknown) =>
        kindOf(e) === "invalid" && /no open payment intent/.test(String((e as Error).message))
    );
  });
});

// SOMEBODY ELSE'S INTENT IS NOT REACHABLE ANY MORE, and that is the point of
// the change rather than a lost test: the id used to arrive in the body and
// was checked against the caller; it is now SELECTed by the customer's own id,
// so an intent belonging to another customer cannot be named at all. What the
// customer has instead is nothing, and nothing is refused.
test("another customer's intent cannot be named, so the order refuses", async () => {
  await inPinned(async (c: PoolClient) => {
    const f = await fixtures(c);
    assert.ok(f, "no fixtures");
    const checkout_id = await primeSaleCheckout(c, f);
    await seedIntent(c, `pi_p9_theirs_${Date.now()}`, { cents: 999999, user_id: null });
    await assert.rejects(
      () => place.place(checkout_id),
      (e: unknown) => kindOf(e) === "invalid"
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
    const checkout_id = await primeSaleCheckout(c, f);
    // Labelled Pending ON PURPOSE: under the old status-driven rule this
    // label made the paid order supersedable. The payment fact wins now.
    const paid = await seedSale(c, "Pending");
    await seedIntent(c, `pi_p9_attached_${Date.now()}`, {
      status: "succeeded", cents: 999999, settledCents: 999999,
      user_id: f.user_id, order_id: paid,
    });
    await assert.rejects(
      () => place.place(checkout_id),
      (e: unknown) => kindOf(e) === "conflict"
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
// the intent is already succeeded and unattached. If it still matches the
// server's price to the cent, the order is created and born Preparing - the
// money is real and there is nothing left to await.
test("a paid-but-orderless intent is honoured: the order is created already Preparing", async () => {
  await inPinned(async (c: PoolClient) => {
    const f = await fixtures(c);
    assert.ok(f, "no fixtures");
    const checkout_id = await primeSaleCheckout(c, f);
    const cents = await pricedCents(c, f);
    assert.ok(cents > 0, "the fixture order priced to zero, which defeats this test");
    const pi = `pi_p9_repair_${Date.now()}`;
    await seedIntent(c, pi, {
      status: "succeeded", cents, settledCents: cents, user_id: f.user_id,
    });

    const order = await place.place(checkout_id);
    assert.ok(order, "no order came back");
    const got = await statusOf(c, order.order.id);
    assert.equal(got.native, "Preparing", "a PAID order was born awaiting payment");

    // THE INTENT IS ATTACHED TO THE ORDER IT PAID FOR.
    const { rows: attached } = await query<{ order_id: string | null }>(
      `SELECT i.order_id FROM payments.intents i
         JOIN payments.attempts a ON a.intent_id = i.id
        WHERE a.provider_ref = $1`, [pi], c
    );
    assert.equal(attached[0]?.order_id, order.order.id);
  });
});

test("a paid intent at a DIFFERENT price than the cart is refused, naming support", async () => {
  await inPinned(async (c: PoolClient) => {
    const f = await fixtures(c);
    assert.ok(f, "no fixtures");
    const checkout_id = await primeSaleCheckout(c, f);
    const cents = await pricedCents(c, f);
    await seedIntent(c, `pi_p9_stale_${Date.now()}`, {
      status: "succeeded", cents: cents + 12345, settledCents: cents + 12345,
      user_id: f.user_id,
    });
    await assert.rejects(
      () => place.place(checkout_id),
      (e: unknown) => kindOf(e) === "conflict" && /support/.test(String((e as Error).message))
    );
  });
});

// THE LABEL DERIVES FROM THE MONEY FACT: nothing left to charge means nothing
// to await, whatever the payment method was called.
//
// CREDIT IS THE SERVER'S FACT NOW, NOT A CHECKBOX (D214 item 11). `using_funds`
// arrived in the body; the balance is a row this API owns, and the pricing
// already caps what is applied at the order's own total. So a customer whose
// balance covers the order needs no intent at all.
test("an order fully covered by credit is born Preparing, with no intent attached", async () => {
  await inPinned(async (c: PoolClient) => {
    const f = await fixtures(c);
    assert.ok(f, "no fixtures");
    const checkout_id = await primeSaleCheckout(c, f);
    await query(
      `UPDATE auth.users SET dorado_funds = 10000000 WHERE id = $1`,
      [f.user_id], c
    );

    const order = await place.place(checkout_id);
    assert.ok(order, "no order came back");
    assert.equal(order.order.status, "Preparing", "a fully-paid order was born awaiting payment");
    assert.ok(
      Number(order.totals?.funds) > 0,
      "the customer's credit was not applied to the order"
    );
    assert.equal(order.totals?.used_funds, true);
  });
});

// THE CHECKOUT IS CONSUMED. Its ids and its lines belong to the order now.
test("placing a sale empties the checkout row it came from", async () => {
  await inPinned(async (c: PoolClient) => {
    const f = await fixtures(c);
    assert.ok(f, "no fixtures");
    const checkout_id = await primeSaleCheckout(c, f);
    await query(
      `UPDATE auth.users SET dorado_funds = 10000000 WHERE id = $1`,
      [f.user_id], c
    );
    await place.place(checkout_id);

    const { rows } = await query<{ recipient_address_id: string | null; payment_method_id: string | null }>(
      `SELECT recipient_address_id, payment_method_id FROM checkout.checkouts WHERE id = $1`,
      [checkout_id], c
    );
    assert.equal(rows[0]?.recipient_address_id, null);
    assert.equal(rows[0]?.payment_method_id, null);
  });
});
