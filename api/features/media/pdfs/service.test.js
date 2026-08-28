// The PDF service, end to end, against real Chromium and real orders.
//
// 746 lines with no test of any kind, generating the documents a customer
// actually receives: the packing list when an order is placed, the invoice when
// an offer is accepted, the return packing list when metal goes back.
//
// The orders come from the repo rather than a fixture, because the input is the
// wire shape and a hand-written fixture would drift away from it silently -
// which is the failure mode that matters here. The service reads deep into the
// object (item.scrap.metal, order.payout.cost, order.shipment.shipping_charge),
// so a shape change breaks it in a way no unit test on a literal would notice.
//
// Read-only: generating a PDF writes nothing.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import pool from "#db";
import * as pdf from "#features/media/pdfs/service.ts";
import { closeBrowser } from "#providers/pdfs/puppeteer.ts";
import * as poRepo from "#features/purchase-orders/read.service.ts";
import * as soRepo from "#features/sales-orders/service.ts";
import * as spotsService from "#features/spots/service.ts";
import { calculateTotalPrice } from "#features/purchase-orders/utils/calculations.ts";
import { formatCurrency } from "#features/media/pdfs/render/format.ts";

let orders;
let salesOrders;
let spots;

before(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
  orders = await poRepo.getAll();
  salesOrders = await soRepo.getAll();
  // The composed shape (`name` / `ask` / `bid`): the ORDERS wire converted
  // (D84), the frontend's mapping edge died with it, and the renderers read
  // the schema's own spellings off the body.
  spots = await spotsService.getSpotPrices();
  assert.ok(orders.length > 0, "dev has no purchase orders to render");
  assert.ok(spots.length > 0, "dev has no spot prices");
});

after(async () => {
  // Otherwise Chromium outlives the test run.
  await closeBrowser();
  await pool.end();
});

// puppeteer returns a Uint8Array, not a Buffer. The controller does res.end(pdf)
// and reads pdf.length, both of which work either way, so accepting both here
// is the honest assertion rather than a loosened one.
const isPdf = (buf, what) => {
  assert.ok(buf instanceof Uint8Array, `${what} did not return bytes`);
  assert.equal(Buffer.from(buf.subarray(0, 5)).toString(), "%PDF-", `${what} is not a PDF`);
  // A PDF of a blank page is around 1KB; anything real is well past that. This
  // catches a render that succeeded structurally and drew nothing.
  assert.ok(buf.length > 4000, `${what} is only ${buf.length} bytes - it rendered nearly nothing`);
};

// One order through every document, which is the realistic case: the same order
// produces a packing list on the way in and an invoice on the way out.
test("every document renders for a real order", async () => {
  const order = orders.find((o) => o.order_items?.length > 0) ?? orders[0];

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

// packageDetails is optional at the call site and the service falls back to
// "Unknown Package" - so a missing one must not throw.
test("a packing list renders with no package details", async () => {
  const order = orders.find((o) => o.order_items?.length > 0) ?? orders[0];
  isPdf(
    await pdf.generatePackingList({ purchaseOrder: order, spotPrices: spots }),
    "packing list without package details"
  );
});

test("a sales order invoice renders", async () => {
  const order = salesOrders.find((o) => o.order_items?.length > 0) ?? salesOrders[0];
  assert.ok(order, "dev has no sales orders to render");
  isPdf(await pdf.generateSalesOrderInvoice({ salesOrder: order, spots }), "sales order invoice");
});

// Every order in dev, not just a convenient one. Orders differ in ways the
// service reads directly - a mix of scrap and bullion, a null premium, no
// shipment, a payout of zero, no address at all - and each of those is a
// branch.
//
// Against the HTML rather than the PDF: this same sweep took 65 seconds when it
// printed 32 documents through Chromium, and found the address bug in the
// building, not the printing. The three tests above still prove Chromium works.
test("every purchase order in dev builds both documents", () => {
  const failures = [];
  for (const order of orders) {
    for (const [name, build] of [
      ["packing list", () => pdf.buildPackingListHtml({ purchaseOrder: order, spotPrices: spots })],
      ["invoice", () => pdf.buildInvoiceHtml({ purchaseOrder: order, spotPrices: spots, orderSpots: [] })],
      ["return packing list", () => pdf.buildReturnPackingListHtml({ purchaseOrder: order, spotPrices: spots })],
    ]) {
      try {
        const html = build();
        if (typeof html !== "string" || html.length < 500) {
          failures.push(`order ${order.number}: ${name} built ${html?.length ?? 0} chars`);
        }
        // NaN reaches the page as the literal text "NaN" and renders as one:
        // an SVG attribute, a weight, a price. Nothing throws, so the sweep
        // above passed on 68 of them for months. Checked across all three
        // documents rather than only the box, because arithmetic on a missing
        // field is not specific to the box.
        if (typeof html === "string" && html.includes("NaN")) {
          failures.push(`order ${order.number}: ${name} contains NaN`);
        }
      } catch (err) {
        failures.push(`order ${order.number}: ${name} threw - ${err.message}`);
      }
    }
  }
  assert.deepEqual(failures, []);
});

// The bug this whole file was written around: five of dev's sixteen purchase
// orders have no address_id, and production has one. Every address field was
// dereferenced unguarded, so the document was a 500 instead of a document.
test("an order with no address still builds, with the address left blank", () => {
  const order = orders.find((o) => !o.address);
  assert.ok(order, "dev no longer has an order without an address - the case is untested");

  const html = pdf.buildPackingListHtml({ purchaseOrder: order, spotPrices: spots });
  assert.ok(html.includes("<html") || html.includes("<!DOCTYPE"), "did not build a document");
  assert.ok(!html.includes("undefined"), "an unset address field reached the page as 'undefined'");
});

// The box drawn on the packing list is geometry built from the package
// dimensions, and `packageDetails` comes from the request body. When it is
// absent, service.js falls back to `{ length: "-", width: "-", height: "-" }` -
// correct as the printed text "Length: - in", and NaN as arithmetic. Every
// coordinate is `dimension * scale`, so the customer's packing list carried an
// SVG with `width="NaN"`, `height="NaN"`, `viewBox="NaN NaN NaN NaN"` and 68
// NaNs in total. Found by giving generateBoxSVG a type; every test in this file
// that omits packageDetails had been rendering it for months.
test("a packing list with no package details draws no box, rather than a broken one", () => {
  const order = orders[0];

  const html = pdf.buildPackingListHtml({ purchaseOrder: order, spotPrices: spots });
  assert.ok(!html.includes("NaN"), "the packing list contains NaN");
  assert.ok(!html.includes("<svg"), "a box was drawn from dimensions that do not exist");

  // And the box is still drawn when there is a package, so the two assertions
  // above cannot pass by never drawing one at all.
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

// The sales order invoice names four metals in its spot table and read
// `spots.find(...).ask` on each with no guard. `spots` comes from the
// request body, so an omitted or partial one threw a TypeError - and this
// invoice is the attachment on the refiner's copy of a sales order, built after
// the transaction that marks the order sent. Found by removing the address
// guard in features/sales-orders/service.js to prove its test could fail: it
// failed here instead.
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

// The invoice and the packing list must agree on what the order is worth. They
// did not: the packing list had its own copy of the sum that fell back to the
// scrap row's premium, and purchase order 239 came out $3,236.11 apart.
test("the packing list and the invoice report the same total", () => {
  for (const order of orders) {
    const total = calculateTotalPrice(order, spots);
    if (!Number.isFinite(total)) continue;

    const money = formatCurrency(total);
    const packing = pdf.buildPackingListHtml({ purchaseOrder: order, spotPrices: spots });
    assert.ok(
      packing.includes(money),
      `order ${order.number}: the packing list does not show ${money}`
    );
  }
});


// A line that never reaches the table is the quiet failure: the customer sees a
// document that does not list what they sent, and the total still includes it.
// Both row builders filter on the nested object being present
// (`item.item_type === "scrap" && item.scrap`), so an item whose scrap or
// product did not load disappears without any error.
test("every order item appears as a row in the packing list", () => {
  const missing = [];
  for (const order of orders) {
    const items = order.order_items ?? [];
    if (!items.length) continue;

    const html = pdf.buildPackingListHtml({ purchaseOrder: order, spotPrices: spots });
    const rows = (html.match(/<tr>/g) ?? []).length;
    const renderable = items.filter(
      (i) => (i.item_type === "scrap" && i.scrap) || (i.item_type === "product" && i.product)
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
