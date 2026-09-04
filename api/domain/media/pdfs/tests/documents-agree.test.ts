import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#pool";
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

    const { bids, labels } = await inputs.invoiceInputs(order.order.id);

    const packing = percentages(buildPackingScrapRows(scrap, bids, labels));
    const invoice = percentages(buildInvoiceScrapRows(scrap, bids, labels));

    if (JSON.stringify(packing) !== JSON.stringify(invoice)) {
      disagreements.push(
        `  PO ${order.order.number}: packing ${JSON.stringify(packing)} vs invoice ${JSON.stringify(invoice)}`
      );
    }
  }

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

  assert.deepEqual(
    percentages(packing), percentages(invoice),
    "the two documents rendered different percentages"
  );
  assert.deepEqual(percentages(packing), ["99.9"], "a document invented a rate");
  assert.ok(packing.includes("&mdash;"), "the packing list did not mark the premium unknown");
  assert.ok(invoice.includes("&mdash;"), "the invoice did not mark the premium unknown");
});
