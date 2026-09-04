// The PDF service, end to end, against real Chromium and real orders.
//
// 746 lines with no test of any kind, generating the documents a customer
// actually receives: the packing list when an order is placed, the invoice when
// an offer is accepted, the return packing list when metal goes back.
//
// The orders come from the API's own read rather than a fixture, because the
// input is the ORDER VIEW and a hand-written fixture would drift away from it
// silently - which is the failure mode that matters here. The templates read
// deep into it (line.product.content, payout.cost, the inbound shipment's
// cost), so a shape change breaks them in a way no unit test on a literal
// would notice.
//
// Read-only: generating a PDF writes nothing.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import pool from "#db";
import * as pdf from "#domain/media/pdfs/service.ts";
import { closeBrowser } from "#providers/pdfs/puppeteer.ts";
import * as orderRead from "#domain/orders/read.ts";
import * as inputs from "#domain/media/pdfs/order-inputs.ts";
import { calculateTotalPrice, type Bids } from "#domain/pricing/service.ts";
import { formatCurrency } from "#domain/media/pdfs/render/format.ts";
import type { DocumentLabels } from "#domain/media/pdfs/render/sections.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import type { PoolClient } from "pg";
import type { OrderView } from "@dorado/contracts";

let orders: OrderView[];
let salesOrders: OrderView[];
let bids: Bids;
let labels: DocumentLabels;
let lockClient: PoolClient;

const viewsOf = async (direction: "purchase" | "sale") => {
  const out: OrderView[] = [];
  for (const row of await orderRead.list({ direction })) {
    const view = await orderRead.view(row.id);
    if (view) out.push(view);
  }
  return out;
};

// The document's inputs, resolved once: whichever quote the order prices at
// and the labels behind the ids its rows carry.
const inputsFor = async (order: OrderView) => await inputs.invoiceInputs(order.order.id);

// SESSION-scoped LOCKS.ORDERS, held for the whole file (lane 3, the runner
// conversion): `orders`/`salesOrders` are captured here and re-read later by
// individual tests via `inputsFor`, and domain/orders/tests/edit-line.test.ts
// writes real, autocommitting rows to orders.orders under the SAME lock -
// see domain/media/pdfs/tests/documents-agree.test.ts's own comment for the
// full mechanism.
beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
  lockClient = await pool.connect();
  await lockClient.query("SELECT pg_advisory_lock($1)", [LOCKS.ORDERS]);
  orders = await viewsOf("purchase");
  salesOrders = await viewsOf("sale");
  assert.ok(orders.length > 0, "dev has no purchase orders to render");
  ({ bids, labels } = await inputsFor(orders[0]));
  assert.ok(labels.metals.size > 0, "dev has no metals to label a document with");
});

afterAll(async () => {
  await lockClient.query("SELECT pg_advisory_unlock($1)", [LOCKS.ORDERS]);
  lockClient.release();
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
  const order = orders.find((o) => o.items.length > 0) ?? orders[0];
  const own = await inputsFor(order);

  isPdf(
    await pdf.generatePackingList({
      order, bids: own.bids, labels: own.labels,
      package: { label: "Medium Box", length: 10, width: 8, height: 6 },
    }),
    "packing list"
  );

  isPdf(await pdf.generateInvoice(own), "invoice");
  isPdf(await pdf.generateReturnPackingList(own), "return packing list");
});

// packageDetails is optional at the call site (the service falls back to "Unknown Package"), so a missing one must not throw.
test("a packing list renders with no package details", async () => {
  const order = orders.find((o) => o.items.length > 0) ?? orders[0];
  const own = await inputsFor(order);
  isPdf(
    await pdf.generatePackingList(own),
    "packing list without package details"
  );
});

test("a sales order invoice renders", async () => {
  const order = salesOrders.find((o) => o.items.length > 0) ?? salesOrders[0];
  assert.ok(order, "dev has no sales orders to render");
  isPdf(
    await pdf.generateSalesOrderInvoice(
      await inputs.salesOrderInvoiceInputs(order.order.id)
    ),
    "sales order invoice"
  );
});

// Every order in dev, not just a convenient one. Orders differ in ways the
// service reads directly - a mix of scrap and bullion, a null premium, no
// shipment, a payout of zero, no address at all - and each of those is a
// branch.
//
// Against the HTML rather than the PDF: this same sweep took 65 seconds when it
// printed 32 documents through Chromium, and found the address bug in the
// building, not the printing. The three tests above still prove Chromium works.
test("every purchase order in dev builds both documents", async () => {
  const failures: string[] = [];
  for (const order of orders) {
    const own = await inputsFor(order);
    // Declared as a tuple list: inferred, the element type collapses to
    // `string | (() => string)` and `build()` is then not callable.
    const documents: Array<[string, () => string]> = [
      ["packing list", () => pdf.buildPackingListHtml(own)],
      ["invoice", () => pdf.buildInvoiceHtml(own)],
      ["return packing list", () => pdf.buildReturnPackingListHtml(own)],
    ];
    for (const [name, build] of documents) {
      try {
        const html = build();
        if (typeof html !== "string" || html.length < 500) {
          failures.push(`order ${order.order.number}: ${name} built ${html?.length ?? 0} chars`);
        }
        // NaN reaches the page as the literal text "NaN" (an SVG attribute, a weight, a price) and nothing throws - the sweep above passed on 68 of them for months.
        // Checked across all three documents, not just the box, since arithmetic on a missing field isn't specific to it.
        if (typeof html === "string" && html.includes("NaN")) {
          failures.push(`order ${order.order.number}: ${name} contains NaN`);
        }
      } catch (err) {
        failures.push(`order ${order.order.number}: ${name} threw - ${(err as Error).message}`);
      }
    }
  }
  assert.deepEqual(failures, []);
});

// The bug this whole file was written around: 5 of dev's 16 purchase orders have no address_id (production has one), and every address field was dereferenced unguarded - a 500 instead of a document.
test("an order with no address still builds, with the address left blank", async () => {
  const order = orders.find((o) => !o.address);
  assert.ok(order, "dev no longer has an order without an address - the case is untested");

  const html = pdf.buildPackingListHtml(await inputsFor(order!));
  assert.ok(html.includes("<html") || html.includes("<!DOCTYPE"), "did not build a document");
  assert.ok(!html.includes("undefined"), "an unset address field reached the page as 'undefined'");
});

// The box is geometry built from package dimensions (from the request body); when absent, the fallback `{ length: "-", ... }` is correct as text but NaN as arithmetic - the customer's packing list carried `width="NaN"`, `height="NaN"`, `viewBox="NaN NaN NaN NaN"`, 68 NaNs total.
// Found by giving generateBoxSVG a type; every test in this file omitting packageDetails had been rendering it for months.
test("a packing list with no package details draws no box, rather than a broken one", async () => {
  const order = orders.find((o) => o.shipments.every((s) => !s.package_id)) ?? orders[0];
  const own = await inputsFor(order);

  const html = pdf.buildPackingListHtml(own);
  assert.ok(!html.includes("NaN"), "the packing list contains NaN");
  assert.ok(!html.includes("<svg"), "a box was drawn from dimensions that do not exist");

  // The box is still drawn when there is a package, so the two assertions above can't pass by never drawing one at all.
  const withBox = pdf.buildPackingListHtml(
    Object.assign({ package: { label: "Small Box", length: 9, width: 6, height: 2 } }, own)
  );
  assert.ok(withBox.includes("<svg"), "no box was drawn for a real package");
  assert.ok(!withBox.includes("NaN"), "a real package produced NaN coordinates");
  assert.ok(withBox.includes("Length: 9 in"), "the dimensions are not printed");
});

// The sales order invoice read `spots.find(...).ask` on each of four metals with no guard; spots comes from the request body, so an omitted or partial one threw - and this invoice is built after the transaction marks the order sent, so the throw was silent.
// Found by removing the address guard in sales-orders/service.ts to prove its test could fail: it failed here instead.
test("a sales order invoice builds with no spot prices at all", () => {
  const order = salesOrders[0];
  assert.ok(order, "dev has no sales order");

  const html = pdf.buildSalesOrderInvoiceHtml({ order, asks: new Map(), labels });
  assert.ok(html.length > 500, "no document was produced");
  assert.ok(!html.includes("NaN"), "the invoice contains NaN");
  assert.ok(html.includes("&mdash;"), "a missing spot rendered as nothing at all");

  // A partial set is the more likely shape: one metal quoted, three not.
  const [gold] = [...labels.metals].find(([, name]) => name === "Gold") ?? [];
  assert.ok(gold, "dev has no metal called Gold");
  const partial = pdf.buildSalesOrderInvoiceHtml({
    order,
    asks: new Map([[gold!, 4000]]),
    labels,
  });
  assert.ok(partial.includes("$4,000.00"), "the quoted metal is missing");
  assert.ok(partial.includes("&mdash;"), "the unquoted metals rendered as nothing at all");
});

// The invoice and the packing list must agree on what the order is worth. They
// did not: the packing list had its own copy of the sum that fell back to the
// scrap row's premium, and purchase order 239 came out $3,236.11 apart.
test("the packing list and the invoice report the same total", async () => {
  // NO CAST ANY MORE. The production caller used to do
  // `purchaseOrder as unknown as Parameters<typeof calculateTotalPrice>[0]`
  // because the composed tree overlapped PricedOrder without satisfying it;
  // both take the OrderView now.
  for (const order of orders) {
    const own = await inputsFor(order);
    let total: number;
    try {
      total = calculateTotalPrice(order, own.bids);
    } catch {
      // A metal with no quote stops pricing, deliberately.
      continue;
    }
    if (!Number.isFinite(total)) continue;

    const money = formatCurrency(total);
    const packing = pdf.buildPackingListHtml(own);
    assert.ok(
      packing.includes(money),
      `order ${order.order.number}: the packing list does not show ${money}`
    );
  }
});


// A line that never reaches the table is the quiet failure: the customer sees a document that doesn't list what they sent, while the total still includes it.
// Both row builders filter on the nested object being present (`item.item_type === "scrap" && item.scrap`), so an item whose scrap or product didn't load disappears without any error.
// A LINE CANNOT BE DROPPED ANY MORE, and that is the point: both row builders
// used to filter on a nested object being present
// (`item.item_type === "scrap" && item.scrap`), so a line whose scrap or
// product did not load disappeared from the table without any error while the
// total still counted it. A line is scrap or bullion by `bullion_id` now, and
// the two builders partition the list between them.
test("every order item appears as a row in the packing list", async () => {
  const missing: string[] = [];
  for (const order of orders) {
    if (!order.items.length) continue;

    const html = pdf.buildPackingListHtml(await inputsFor(order));
    const rows = (html.match(/<tr>/g) ?? []).length;

    // Header rows exist too, so this is a floor rather than an equality.
    if (rows < order.items.length) {
      missing.push(
        `order ${order.order.number}: ${order.items.length} items but only ${rows} rows`
      );
    }
  }
  assert.deepEqual(missing, []);
});
