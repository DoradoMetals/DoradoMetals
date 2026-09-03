// The packing list and the invoice must say the same thing about the same line - two views of one order a customer sees both. When they disagree, the business told somebody two different numbers for the same metal ($3,236.11, per CLAUDE.md).
// This caught a live one: buildPackingScrapRows resolved `item.premium ?? scrap.bid_premium`, buildInvoiceScrapRows read `item.premium` directly - on order 239 that field is null (`null * 100` is 0, not an error), so the packing list showed 75.0% and the invoice showed 0.0% for the same line, silently.
// Found by converting sections.ts to TypeScript (`item.premium is possibly null`), confirmed by rendering both documents for that order before changing anything.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import pool from "#db";
import * as poRepo from "#domain/orders/read.service.ts";
import * as spotsService from "#domain/spots/service.ts";
import {
  buildPackingScrapRows,
  buildInvoiceScrapRows,
} from "#domain/media/pdfs/render/sections.ts";
import type { RenderableOrder } from "#domain/media/pdfs/render/sections.ts";

// getAllPurchases declares Record<string, unknown>[] because read.service.ts discards the composed type at the boundary.
type RenderOrder = RenderableOrder & { id: string };
type RenderItem = NonNullable<RenderableOrder["order_items"]>[number];
type Spot = Awaited<ReturnType<typeof spotsService.getSpotPrices>>[number];

let orders: RenderOrder[];
let spots: Spot[];

before(async () => {
  orders = (await poRepo.getAllPurchases()) as unknown as RenderOrder[];
  // The composed shape (name/ask/bid) - what the renderers read.
  spots = await spotsService.getSpotPrices();
  assert.ok(orders.length > 0, "dev has no purchase orders");
});

after(async () => {
  await pool.end();
});

const percentages = (html: string) => [...html.matchAll(/>([\d.]+)%</g)].map((m) => m[1]);

test("every order's packing list and invoice quote the same premiums", async () => {
  const disagreements: string[] = [];
  let compared = 0;

  for (const order of orders) {
    const scrapItems = (order.order_items ?? []).filter(
      (i: RenderItem) => i.item_type === "scrap" && i.scrap
    );
    if (!scrapItems.length) continue;
    compared++;

    const packing = percentages(buildPackingScrapRows(scrapItems, spots));
    const invoice = percentages(buildInvoiceScrapRows(scrapItems, spots).rowsHtml);

    if (JSON.stringify(packing) !== JSON.stringify(invoice)) {
      disagreements.push(
        `  PO ${order.number}: packing ${JSON.stringify(packing)} vs invoice ${JSON.stringify(invoice)}`
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

// The fallback itself, on a constructed item rather than whatever dev happens to hold - the first version looked for a real order item with a null premium and PASSED even with the fallback removed, so it wasn't testing the fallback at all.
// Built by hand instead: no database dependency, and it fails the moment the fallback goes.
test("an item with no premium of its own renders the scrap's bid premium", () => {
  const item = {
    item_type: "scrap",
    price: null,
    premium: null,
    quantity: 1,
    scrap: {
      name: "Test Scrap",
      metal: "Gold",
      content: 1,
      purity: 0.999,
      pre_melt: 1,
      post_melt: 1,
      gross_unit: "t oz",
      bid_premium: 0.75,
    },
  };

  const { rowsHtml } = buildInvoiceScrapRows([item], spots);
  const shown = percentages(rowsHtml);

  assert.ok(
    shown.includes("75.0"),
    `the invoice should fall back to the scrap's 75% bid premium. Rendered: ${JSON.stringify(shown)}`
  );
  assert.ok(
    !shown.includes("0.0"),
    `the invoice rendered a 0.0% premium instead of falling back. Rendered: ${JSON.stringify(shown)}`
  );
});
