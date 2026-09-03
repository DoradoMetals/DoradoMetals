// The packing list and the invoice must say the same thing about the same line.
//
// They are two views of one order and a customer sees both: the packing list
// goes in the parcel, the invoice states what they are paid. When they
// disagree, the business has told somebody two different numbers for the same
// metal - and CLAUDE.md already records one instance of exactly that, an
// invoice and a packing list out by $3,236.11.
//
// THE DIVERGENCE THIS CAUGHT IS NOW UNREPRESENTABLE, which is the better fix.
// buildPackingScrapRows resolved the premium as `item.premium ?? scrap
// .bid_premium` and buildInvoiceScrapRows read `item.premium` directly, so on
// an order with a null premium the two rendered 75.0% and 0.0%. There is one
// premium on the line now, one price expression under both builders
// (pricing/bid.ts's `unitPrice`), and no nested `scrap` object to fall back
// into - so this file compares the two documents on every real order and pins
// that a line with no premium renders as unpriced on BOTH.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#db";
import * as orderRead from "#domain/orders/read.ts";
import * as inputs from "#domain/media/pdfs/order-inputs.ts";
import { scrapLines } from "#domain/pricing/service.ts";
import {
  buildPackingScrapRows,
  buildInvoiceScrapRows,
} from "#domain/media/pdfs/render/sections.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import type { OrderView, OrderViewItem } from "@dorado/contracts";

let orders: OrderView[];
let lockClient: PoolClient;

// SESSION-scoped LOCKS.ORDERS, held for the whole file (lane 3, the runner
// conversion): every read here is a real, autocommitting read on the shared
// pool - no transaction of its own to take a transaction-scoped lock in,
// same shape as domain/orders/tests/edit-line.test.ts, which writes real
// orders.orders rows under the SAME lock. Without it, `orders` (captured
// once in beforeAll) can hold an id edit-line has since deleted by the time
// a later test's `invoiceInputs()` call re-reads it - `locks.ts`'s own
// warning that a missing lock is latent until timing changes elsewhere.
beforeAll(async () => {
  lockClient = await pool.connect();
  await lockClient.query("SELECT pg_advisory_lock($1)", [LOCKS.ORDERS]);

  const ids = (await orderRead.list({ direction: "purchase" })).map((o) => o.id);
  orders = [];
  for (const id of ids) {
    const view = await orderRead.view(id);
    if (view) orders.push(view);
  }
  assert.ok(orders.length > 0, "dev has no purchase orders");
});

afterAll(async () => {
  await lockClient.query("SELECT pg_advisory_unlock($1)", [LOCKS.ORDERS]);
  lockClient.release();
  await pool.end();
});

const percentages = (html: string) => [...html.matchAll(/>([\d.]+)%</g)].map((m) => m[1]);

test("every order's packing list and invoice quote the same premiums", async () => {
  const disagreements: string[] = [];
  let compared = 0;

  for (const order of orders) {
    const scrap = scrapLines(order.items);
    if (!scrap.length) continue;
    compared++;

    // The SAME inputs both documents are built from - the quote the order
    // prices at and the labels behind its ids.
    const { bids, labels } = await inputs.invoiceInputs(order.order.id);

    const packing = percentages(buildPackingScrapRows(scrap, bids, labels));
    const invoice = percentages(buildInvoiceScrapRows(scrap, bids, labels));

    if (JSON.stringify(packing) !== JSON.stringify(invoice)) {
      disagreements.push(
        `  PO ${order.order.number}: packing ${JSON.stringify(packing)} vs invoice ${JSON.stringify(invoice)}`
      );
    }
  }

  // Not vacuous: if no order had scrap lines, this would pass having compared nothing - how the bug survived in the first place.
  assert.ok(
    compared > 0,
    "no order in dev has scrap lines - this test compared nothing"
  );

  assert.deepEqual(
    disagreements,
    [],
    `the two documents disagree on ${disagreements.length} order(s):\n${disagreements.join("\n")}`
  );
});

// A LINE WITH NO PREMIUM RENDERS AS UNPRICED ON BOTH DOCUMENTS.
//
// The old fallback into `scrap.bid_premium` is gone with the composed line -
// the composer served that field FROM `item.premium`, so on real data it could
// only ever resolve to the same value, and a hand-built fixture was the only
// way to reach it. What has to hold is that neither document invents a rate:
// an em dash on both, never 0.0% on one and 75.0% on the other.
test("a line with no premium renders unpriced on both documents, not differently", () => {
  const GOLD = "11111111-1111-4111-8111-111111111111";
  const line = {
    id: "line-1",
    order_id: "order-1",
    bullion_id: null,
    metal_id: GOLD,
    price: null,
    premium: null,
    quantity: 1,
    content: 1,
    purity: 0.999,
    pre_melt: 1,
    post_melt: 1,
    unit: "t oz",
    product: null,
  } as unknown as OrderViewItem;

  const bids = new Map([[GOLD, 4000]]);
  const labels = {
    metals: new Map([[GOLD, "Gold"]]),
    services: new Map<string, string>(),
    packages: new Map<string, string>(),
  };

  const packing = buildPackingScrapRows([line], bids, labels);
  const invoice = buildInvoiceScrapRows([line], bids, labels);

  // The purity renders as a percentage on both; the PREMIUM is the cell under
  // test, and an absent one is an em dash rather than an invented rate.
  assert.deepEqual(
    percentages(packing), percentages(invoice),
    "the two documents rendered different percentages"
  );
  assert.deepEqual(percentages(packing), ["99.9"], "a document invented a rate");
  assert.ok(packing.includes("&mdash;"), "the packing list did not mark the premium unknown");
  assert.ok(invoice.includes("&mdash;"), "the invoice did not mark the premium unknown");
});
