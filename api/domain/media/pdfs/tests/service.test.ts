// The PDF service, end to end, against real Chromium and real orders - generates the documents a customer actually receives (packing list, invoice, return packing list).
// Orders come from the repo, not a fixture: the input is the wire shape, and a hand-written fixture would drift from it silently - the service reads deep into the object (item.scrap.metal, order.payout.cost, order.shipment.shipping_charge), so a shape change breaks it in a way no literal-based unit test would notice. Read-only: generating a PDF writes nothing.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import pool from "#db";
import * as pdf from "#domain/media/pdfs/service.ts";
import { closeBrowser } from "#providers/pdfs/puppeteer.ts";
import * as poRepo from "#domain/orders/read.service.ts";
import * as soRepo from "#domain/orders/service.ts";
import * as spotsService from "#domain/spots/service.ts";
import { calculateTotalPrice } from "#domain/pricing/service.ts";
import { formatCurrency } from "#domain/media/pdfs/render/format.ts";
import type { RenderableOrder } from "#domain/media/pdfs/render/sections.ts";

// getAllPurchases/getAllSales declare Record<string, unknown>[] (read.service.ts discards the composed type at the boundary), so the fixtures are named as exactly what the templates under test accept.
type RenderOrder = RenderableOrder & { id: string };
type RenderItem = NonNullable<RenderableOrder["order_items"]>[number];
type Spot = Awaited<ReturnType<typeof spotsService.getSpotPrices>>[number];

let orders: RenderOrder[];
let salesOrders: RenderOrder[];
let spots: Spot[];

before(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
  orders = (await poRepo.getAllPurchases()) as unknown as RenderOrder[];
  salesOrders = (await soRepo.getAllSales()) as unknown as RenderOrder[];
  // The composed shape (name/ask/bid) - the renderers read the schema's own spellings off the body.
  spots = await spotsService.getSpotPrices();
  assert.ok(orders.length > 0, "dev has no purchase orders to render");
  assert.ok(spots.length > 0, "dev has no spot prices");
});

after(async () => {
  // Otherwise Chromium outlives the test run.
  await closeBrowser();
  await pool.end();
});

// puppeteer returns Uint8Array, not Buffer - the controller's res.end(pdf) and pdf.length both work either way, so accepting both here is the honest assertion, not a loosened one.
const isPdf = (buf: Uint8Array, what: string) => {
  assert.ok(buf instanceof Uint8Array, `${what} did not return bytes`);
  assert.equal(Buffer.from(buf.subarray(0, 5)).toString(), "%PDF-", `${what} is not a PDF`);
  // A PDF of a blank page is around 1KB; this catches a render that succeeded structurally and drew nothing.
  assert.ok(buf.length > 4000, `${what} is only ${buf.length} bytes - it rendered nearly nothing`);
};

// One order through every document - the realistic case: the same order produces a packing list on the way in, an invoice on the way out.
test("every document renders for a real order", async () => {
  const order = orders.find((o) => (o.order_items?.length ?? 0) > 0) ?? orders[0];

  isPdf(
    await pdf.generatePackingList({
      purchaseOrder: order,
      spotPrices: spots,
      packageDetails: { label: "Medium Box", dimensions: { length: 10, width: 8, height: 6 } },
    }),
    "packing list"
  );

  isPdf(
    await pdf.generateInvoice({ purchaseOrder: order, spotPrices: spots, orderSpots: [] }),
    "invoice"
  );

  isPdf(
    await pdf.generateReturnPackingList({ purchaseOrder: order, spotPrices: spots }),
    "return packing list"
  );
});

// packageDetails is optional at the call site (the service falls back to "Unknown Package"), so a missing one must not throw.
test("a packing list renders with no package details", async () => {
  const order = orders.find((o) => (o.order_items?.length ?? 0) > 0) ?? orders[0];
  isPdf(
    await pdf.generatePackingList({ purchaseOrder: order, spotPrices: spots }),
    "packing list without package details"
  );
});

test("a sales order invoice renders", async () => {
  const order = salesOrders.find((o) => (o.order_items?.length ?? 0) > 0) ?? salesOrders[0];
  assert.ok(order, "dev has no sales orders to render");
  isPdf(await pdf.generateSalesOrderInvoice({ salesOrder: order, spots }), "sales order invoice");
});

// Every order in dev, not just a convenient one - orders differ in ways the service reads directly (scrap/bullion mix, null premium, no shipment, zero payout, no address), each its own branch.
// Against the HTML rather than the PDF: the same sweep took 65s printing 32 documents through Chromium and found the address bug in the building, not the printing - the three tests above still prove Chromium works.
test("every purchase order in dev builds both documents", () => {
  const failures: string[] = [];
  for (const order of orders) {
    // Declared as a tuple list - inferred, the element type collapses to `string | (() => string)` and build() is then not callable.
    const documents: Array<[string, () => string]> = [
      ["packing list", () => pdf.buildPackingListHtml({ purchaseOrder: order, spotPrices: spots })],
      ["invoice", () => pdf.buildInvoiceHtml({ purchaseOrder: order, spotPrices: spots, orderSpots: [] })],
      ["return packing list", () => pdf.buildReturnPackingListHtml({ purchaseOrder: order, spotPrices: spots })],
    ];
    for (const [name, build] of documents) {
      try {
        const html = build();
        if (typeof html !== "string" || html.length < 500) {
          failures.push(`order ${order.number}: ${name} built ${html?.length ?? 0} chars`);
        }
        // NaN reaches the page as the literal text "NaN" (an SVG attribute, a weight, a price) and nothing throws - the sweep above passed on 68 of them for months.
        // Checked across all three documents, not just the box, since arithmetic on a missing field isn't specific to it.
        if (typeof html === "string" && html.includes("NaN")) {
          failures.push(`order ${order.number}: ${name} contains NaN`);
        }
      } catch (err) {
        failures.push(`order ${order.number}: ${name} threw - ${(err as Error).message}`);
      }
    }
  }
  assert.deepEqual(failures, []);
});

// The bug this whole file was written around: 5 of dev's 16 purchase orders have no address_id (production has one), and every address field was dereferenced unguarded - a 500 instead of a document.
test("an order with no address still builds, with the address left blank", () => {
  const order = orders.find((o) => !o.address);
  assert.ok(order, "dev no longer has an order without an address - the case is untested");

  const html = pdf.buildPackingListHtml({ purchaseOrder: order, spotPrices: spots });
  assert.ok(html.includes("<html") || html.includes("<!DOCTYPE"), "did not build a document");
  assert.ok(!html.includes("undefined"), "an unset address field reached the page as 'undefined'");
});

// The box is geometry built from package dimensions (from the request body); when absent, the fallback `{ length: "-", ... }` is correct as text but NaN as arithmetic - the customer's packing list carried `width="NaN"`, `height="NaN"`, `viewBox="NaN NaN NaN NaN"`, 68 NaNs total.
// Found by giving generateBoxSVG a type; every test in this file omitting packageDetails had been rendering it for months.
test("a packing list with no package details draws no box, rather than a broken one", () => {
  const order = orders[0];

  const html = pdf.buildPackingListHtml({ purchaseOrder: order, spotPrices: spots });
  assert.ok(!html.includes("NaN"), "the packing list contains NaN");
  assert.ok(!html.includes("<svg"), "a box was drawn from dimensions that do not exist");

  // The box is still drawn when there is a package, so the two assertions above can't pass by never drawing one at all.
  const withBox = pdf.buildPackingListHtml({
    purchaseOrder: order,
    spotPrices: spots,
    packageDetails: {
      label: "Small Box",
      dimensions: { length: 9, width: 6, height: 2, units: "IN" },
    },
  });
  assert.ok(withBox.includes("<svg"), "no box was drawn for a real package");
  assert.ok(!withBox.includes("NaN"), "a real package produced NaN coordinates");
  assert.ok(withBox.includes("Length: 9 in"), "the dimensions are not printed");
});

// The sales order invoice read `spots.find(...).ask` on each of four metals with no guard; spots comes from the request body, so an omitted or partial one threw - and this invoice is built after the transaction marks the order sent, so the throw was silent.
// Found by removing the address guard in sales-orders/service.ts to prove its test could fail: it failed here instead.
test("a sales order invoice builds with no spot prices at all", () => {
  const order = salesOrders[0];
  assert.ok(order, "dev has no sales order");

  const html = pdf.buildSalesOrderInvoiceHtml({ salesOrder: order, spots: [] });
  assert.ok(html.length > 500, "no document was produced");
  assert.ok(!html.includes("NaN"), "the invoice contains NaN");
  assert.ok(html.includes("&mdash;"), "a missing spot rendered as nothing at all");

  // A partial set is the more likely shape: one metal quoted, three not.
  const partial = pdf.buildSalesOrderInvoiceHtml({
    salesOrder: order,
    spots: [{ name: "Gold", ask: 4000 }],
  });
  assert.ok(partial.includes("$4,000.00"), "the quoted metal is missing");
  assert.ok(partial.includes("&mdash;"), "the unquoted metals rendered as nothing at all");
});

// The invoice and packing list must agree on what the order is worth. They didn't: the packing list had its own copy of the sum with a different premium fallback, and purchase order 239 came out $3,236.11 apart.
test("the packing list and the invoice report the same total", () => {
  for (const order of orders) {
    // The same cast the production caller makes (media/pdfs/service.ts), for the same reason: the composed tree overlaps PricedOrder without satisfying it. Mirrored here rather than papered over.
    const total = calculateTotalPrice(
      order as unknown as Parameters<typeof calculateTotalPrice>[0],
      spots
    );
    if (!Number.isFinite(total)) continue;

    const money = formatCurrency(total);
    const packing = pdf.buildPackingListHtml({ purchaseOrder: order, spotPrices: spots });
    assert.ok(
      packing.includes(money),
      `order ${order.number}: the packing list does not show ${money}`
    );
  }
});


// A line that never reaches the table is the quiet failure: the customer sees a document that doesn't list what they sent, while the total still includes it.
// Both row builders filter on the nested object being present (`item.item_type === "scrap" && item.scrap`), so an item whose scrap or product didn't load disappears without any error.
test("every order item appears as a row in the packing list", () => {
  const missing: string[] = [];
  for (const order of orders) {
    const items = order.order_items ?? [];
    if (!items.length) continue;

    const html = pdf.buildPackingListHtml({ purchaseOrder: order, spotPrices: spots });
    const rows = (html.match(/<tr>/g) ?? []).length;
    const renderable = items.filter(
      (i: RenderItem) => (i.item_type === "scrap" && i.scrap) || (i.item_type === "product" && i.product)
    ).length;

    if (renderable !== items.length) {
      missing.push(
        `order ${order.number}: ${items.length - renderable} of ${items.length} items ` +
          `have no scrap or product object and would be dropped from the table`
      );
    }
    // Header rows exist too, so this is a floor rather than an equality.
    if (rows < renderable) {
      missing.push(`order ${order.number}: ${renderable} items but only ${rows} rows`);
    }
  }
  assert.deepEqual(missing, []);
});
