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
import query from "#shared/db/query.js";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";
import { markSalesOrderPaid } from "#features/orders/paid.service.ts";
import * as orderService from "#features/orders/service.ts";
import * as paymentsService from "#features/payments/service.ts";
import { calculateSalesOrderTotal } from "#features/pricing/ask.ts";
import * as productService from "#features/products/service.ts";
import * as taxService from "#features/sales-tax/service.ts";
import * as spotsService from "#features/spots/service.ts";

test.before(async () => { await mockSessions(); });
test.after(() => { restoreSessions(); });

// A sales order seeded in BOTH schemas, minimally - markSalesOrderPaid touches
// only id/status, and the two tables require only `number` and
// `sales_order_status` beyond their defaults (checked, not guessed).
async function seedSale(c: PoolClient, status: string): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO orders.orders (direction, status, number)
     VALUES ('sale', $1, nextval('exchange.sales_orders_order_number_seq'))
     RETURNING id`,
    [status], c
  );
  const id = rows[0]!.id;
  await query(
    `INSERT INTO exchange.sales_orders (id, sales_order_status)
     VALUES ($1, $2)`,
    [id, status], c
  );
  return id;
}

async function statusOf(c: PoolClient, id: string) {
  const native = await query<{ status: string }>(
    `SELECT status FROM orders.orders WHERE id = $1`, [id], c);
  const legacy = await query<{ s: string }>(
    `SELECT sales_order_status AS s FROM exchange.sales_orders WHERE id = $1`, [id], c);
  return { native: native.rows[0]?.status, legacy: legacy.rows[0]?.s };
}

test("a settled payment advances a Pending sale in BOTH schemas", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const id = await seedSale(c, "Pending");
    assert.equal(await markSalesOrderPaid(id, c), "advanced");
    assert.deepEqual(await statusOf(c, id), { native: "Preparing", legacy: "Preparing" });
  });
});

test("a webhook retry is a no-op, not a second advance", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const id = await seedSale(c, "Pending");
    assert.equal(await markSalesOrderPaid(id, c), "advanced");
    assert.equal(await markSalesOrderPaid(id, c), "already");
    assert.deepEqual(await statusOf(c, id), { native: "Preparing", legacy: "Preparing" });
  });
});

test("a payment arriving after an admin cancelled does NOT resurrect the order", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const id = await seedSale(c, "Cancelled");
    assert.equal(await markSalesOrderPaid(id, c), "already");
    assert.deepEqual(await statusOf(c, id), { native: "Cancelled", legacy: "Cancelled" });
  });
});

// ---------------------------------------------------------------- the webhook

test("payment_intent.succeeded advances the order the intent is attached to", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const orderId = await seedSale(c, "Pending");
    const pi = `pi_p9_webhook_${Date.now()}`;
    await query(
      `INSERT INTO exchange.payment_intents
         (type, payment_intent_id, payment_status, amount, sales_order_id)
       VALUES ('order', $1, 'requires_confirmation', 5178, $2)`,
      [pi, orderId], c
    );

    await paymentsService.updateIntentFromWebhook({
      paymentIntent: { id: pi, status: "succeeded", amount: 5178, amount_received: 5178 },
    });

    assert.deepEqual(await statusOf(c, orderId), { native: "Preparing", legacy: "Preparing" });
  });
});

test("payment_intent.processing does NOT advance the order", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const orderId = await seedSale(c, "Pending");
    const pi = `pi_p9_processing_${Date.now()}`;
    await query(
      `INSERT INTO exchange.payment_intents
         (type, payment_intent_id, payment_status, amount, sales_order_id)
       VALUES ('order', $1, 'requires_confirmation', 5178, $2)`,
      [pi, orderId], c
    );

    await paymentsService.updateIntentFromWebhook({
      paymentIntent: { id: pi, status: "processing", amount: 5178, amount_received: 0 },
    });

    assert.deepEqual(await statusOf(c, orderId), { native: "Pending", legacy: "Pending" });
  });
});

// --------------------------------------------- creation verifies the intent

// A real customer with a real address, and a real displayed product - the
// pricing pipeline runs for real, so the tests compare against what the
// server actually computes rather than a number invented here.
async function fixtures(c: PoolClient) {
  const { rows: pair } = await query<{ user_id: string; address_id: string }>(
    `SELECT e.user_id, e.id AS address_id
       FROM exchange.addresses e
       JOIN auth.users u ON u.id = e.user_id
      WHERE e.user_id IS NOT NULL
      ORDER BY e.id LIMIT 1`, [], c
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

const bodyFor = (f: { address_id: string; product_id: string }) => ({
  address: { id: f.address_id },
  items: [{ id: f.product_id, quantity: 1 }],
  using_funds: false,
  service: { value: "STANDARD", label: "Standard" },
  payment_method: "CARD",
});

async function pricedCents(c: PoolClient, f: { address_id: string; product_id: string; user_id: string }) {
  const { rows: state } = await query<{ state: string }>(
    `SELECT state FROM exchange.addresses WHERE id = $1`, [f.address_id], c);
  const items = await productService.getItemsFromServer([{ id: f.product_id, quantity: 1 }]);
  const spots = await spotsService.getSpotPrices();
  const taxed = await taxService.attachSalesTaxToItems(state[0]!.state, items, spots);
  const prices = calculateSalesOrderTotal(taxed, false, spots, { dorado_funds: 0 }, "STANDARD", "CARD");
  return Math.round(prices.post_charges_amount * 100);
}

const statusCodeOf = (err: unknown) => (err as { statusCode?: number }).statusCode;

test("an order with a charge refuses to exist without a payment intent", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const f = await fixtures(c);
    assert.ok(f, "the test db has no user+address+product to price against");
    await as({ id: f.user_id }, () =>
      assert.rejects(
        () => orderService.createSalesOrder(
          { sales_order: bodyFor(f) as never, payment_intent_id: "" }, {}
        ),
        (e: unknown) => statusCodeOf(e) === 400
      )
    );
  });
});

test("somebody else's payment intent is refused as if it did not exist", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const f = await fixtures(c);
    assert.ok(f, "no fixtures");
    const pi = `pi_p9_theirs_${Date.now()}`;
    await query(
      `INSERT INTO exchange.payment_intents (type, payment_intent_id, payment_status, amount, user_id)
       VALUES ('order', $1, 'requires_confirmation', 999999, gen_random_uuid())`,
      [pi], c
    );
    await as({ id: f.user_id }, () =>
      assert.rejects(
        () => orderService.createSalesOrder(
          { sales_order: bodyFor(f) as never, payment_intent_id: pi }, {}
        ),
        (e: unknown) => statusCodeOf(e) === 403
      )
    );
  });
});

// THE ABANDONED-CHECKOUT RETRY: the customer created an order, never
// confirmed, and came back - their intent still attached to the old Pending
// sale. Refusing would strand them for the sweep's whole TTL, so their own
// unpaid order is superseded: cancelled, credit refunded, intent detached,
// and the new order created.
test("a retry supersedes the customer's own unpaid order instead of refusing", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const f = await fixtures(c);
    assert.ok(f, "no fixtures");
    const cents = await pricedCents(c, f);
    const old = await seedSale(c, "Pending");
    const pi = `pi_p9_supersede_${Date.now()}`;
    await query(
      `INSERT INTO exchange.payment_intents (type, payment_intent_id, payment_status, amount, user_id, sales_order_id)
       VALUES ('order', $1, 'requires_payment_method', $2, $3, $4)`,
      [pi, cents, f.user_id, old], c
    );
    // The old order reserved no credit here (no transactions row with funds),
    // so the supersede is a pure cancel - the refund half is reconcile.test.ts'
    // subject and shares the same helper.
    // A succeeded amount match is needed to dodge the PROVIDER call: seed the
    // intent as succeeded at the right price, so creation takes the repair
    // branch after superseding.
    await query(
      `UPDATE exchange.payment_intents SET payment_status = 'succeeded', amount_received = amount
        WHERE payment_intent_id = $1`, [pi], c
    );

    const order = await as({ id: f.user_id }, () =>
      orderService.createSalesOrder(
        { sales_order: bodyFor(f) as never, payment_intent_id: pi }, {}
      )
    );
    assert.ok(order, "no order came back");
    const newId = (order as { id: string }).id;
    assert.notEqual(newId, old);
    assert.equal((await statusOf(c, old)).native, "Cancelled", "the old unpaid order survived");
    assert.equal((await statusOf(c, newId)).native, "Preparing", "the paid retry was not honoured");

    const { rows: link } = await query<{ sales_order_id: string | null }>(
      `SELECT sales_order_id FROM exchange.payment_intents WHERE payment_intent_id = $1`, [pi], c);
    assert.equal(link[0]!.sales_order_id, newId, "the intent does not point at the new order");
  });
});

test("an intent already attached to an order cannot be attached to a second one", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const f = await fixtures(c);
    assert.ok(f, "no fixtures");
    // A PAID order: the supersede path only reaches a still-Pending sale, so
    // this is the conflict that must genuinely refuse.
    const other = await seedSale(c, "Preparing");
    const pi = `pi_p9_attached_${Date.now()}`;
    await query(
      `INSERT INTO exchange.payment_intents (type, payment_intent_id, payment_status, amount, user_id, sales_order_id)
       VALUES ('order', $1, 'requires_confirmation', 999999, $2, $3)`,
      [pi, f.user_id, other], c
    );
    await as({ id: f.user_id }, () =>
      assert.rejects(
        () => orderService.createSalesOrder(
          { sales_order: bodyFor(f) as never, payment_intent_id: pi }, {}
        ),
        (e: unknown) => statusCodeOf(e) === 409
      )
    );
  });
});

// THE D179 REPAIR PATH: the customer PAID and order creation failed; on retry
// the intent arrives already succeeded and unattached. If it still matches the
// server's price to the cent, the order is created and born Preparing - the
// money is real and there is nothing left to await.
test("a paid-but-orderless intent is honoured: the order is created already Preparing", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const f = await fixtures(c);
    assert.ok(f, "no fixtures");
    const cents = await pricedCents(c, f);
    assert.ok(cents > 0, "the fixture order priced to zero, which defeats this test");
    const pi = `pi_p9_repair_${Date.now()}`;
    await query(
      `INSERT INTO exchange.payment_intents (type, payment_intent_id, payment_status, amount, amount_received, user_id)
       VALUES ('order', $1, 'succeeded', $2, $2, $3)`,
      [pi, cents, f.user_id], c
    );

    const order = await as({ id: f.user_id }, () =>
      orderService.createSalesOrder(
        { sales_order: bodyFor(f) as never, payment_intent_id: pi }, {}
      )
    );
    assert.ok(order, "no order came back");
    const got = await statusOf(c, (order as { id: string }).id);
    assert.equal(got.native, "Preparing", "a PAID order was born awaiting payment");
    assert.equal(got.legacy, "Preparing");
  });
});

test("a paid intent at a DIFFERENT price than the cart is refused, naming support", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const f = await fixtures(c);
    assert.ok(f, "no fixtures");
    const cents = await pricedCents(c, f);
    const pi = `pi_p9_stale_${Date.now()}`;
    await query(
      `INSERT INTO exchange.payment_intents (type, payment_intent_id, payment_status, amount, amount_received, user_id)
       VALUES ('order', $1, 'succeeded', $2, $2, $3)`,
      [pi, cents + 12345, f.user_id], c
    );
    await as({ id: f.user_id }, () =>
      assert.rejects(
        () => orderService.createSalesOrder(
          { sales_order: bodyFor(f) as never, payment_intent_id: pi }, {}
        ),
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
  await inPinnedTransaction(async (c: PoolClient) => {
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
      orderService.createSalesOrder(
        {
          sales_order: { ...bodyFor(f), using_funds: true } as never,
          payment_intent_id: "",
        }, {}
      )
    );
    assert.ok(order, "no order came back");
    const got = await statusOf(c, (order as { id: string }).id);
    assert.equal(got.native, "Preparing", "a fully-paid order was born awaiting payment");
  });
});
