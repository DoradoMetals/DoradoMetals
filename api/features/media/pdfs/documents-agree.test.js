// The packing list and the invoice must say the same thing about the same line.
//
// They are two views of one order and a customer sees both: the packing list
// goes in the parcel, the invoice states what they are paid. When they
// disagree, the business has told somebody two different numbers for the same
// metal - and CLAUDE.md already records one instance of exactly that, an
// invoice and a packing list out by $3,236.11.
//
// THIS CAUGHT A LIVE ONE. buildPackingScrapRows resolved the premium as
// `item.premium ?? scrap.bid_premium`; buildInvoiceScrapRows read `item.premium`
// directly. On order 239 that field is null and `null * 100` is 0 rather than
// an error, so the packing list showed 75.0% and the invoice showed 0.0% for
// the same scrap line. Silent, because neither threw.
//
// Found by converting sections.js to TypeScript - `item.premium is possibly
// null` was the compiler pointing at it - and confirmed by rendering both
// documents for that order before changing anything.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import pool from "#db";
import * as poRepo from "#features/purchase-orders/read.service.ts";
import * as spotsService from "#features/spots/service.ts";
import {
  buildPackingScrapRows,
  buildInvoiceScrapRows,
} from "#features/media/pdfs/render/sections.ts";

let orders;
let spots;

before(async () => {
  orders = await poRepo.getAll();
  // The composed shape (`name` / `ask` / `bid`) - what the renderers read
  // since the orders wire conversion (D84) retired the legacy spellings.
  spots = await spotsService.getSpotPrices();
  assert.ok(orders.length > 0, "dev has no purchase orders");
});

after(async () => {
  await pool.end();
});

const percentages = (html) => [...html.matchAll(/>([\d.]+)%</g)].map((m) => m[1]);

test("every order's packing list and invoice quote the same premiums", async () => {
  const disagreements = [];
  let compared = 0;

  for (const order of orders) {
    const scrapItems = (order.order_items ?? []).filter(
      (i) => i.item_type === "scrap" && i.scrap
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

  // NOT VACUOUS. If no order had scrap lines this would pass having compared
  // nothing, which is how the bug survived in the first place.
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

// THE FALLBACK ITSELF, on a constructed item rather than whatever dev happens
// to hold.
//
// The first version of this test looked for a real order item with a null
// premium and asserted the invoice did not render 0.0%. It PASSED with the
// fallback removed - so it was not testing the fallback at all, and would have
// sat there looking like protection. Whatever it was matching, it was not the
// thing that broke.
//
// Built by hand instead: no database, no dependence on a fixture surviving, and
// it fails the moment the fallback goes.
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
