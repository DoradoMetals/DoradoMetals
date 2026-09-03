// The refiner's copy of a sales order, rendered - pure (reads templates, substitutes; no database/transport/Chromium).
// Sent AFTER the transaction that attaches the supplier and marks order_sent - a throw here is silent: the order says it went and nobody is told. Values the wire contract declares nullable (address, ask_spot) must render, not throw.
import test from "node:test";
import assert from "node:assert/strict";
import {
  renderSalesOrderToSupplierEmail,
  renderOrderPricedEmail,
} from "#domain/media/emails/utils/renderEmail.ts";

// The wire shape, not a convenience object: SalesOrder's address, totals, and an item's price/quantity are nullable - the fixture uses the same converted names the service hands the renderer.
const order = (over = {}) => ({
  id: "00000000-0000-0000-0000-000000000001",
  number: 55,
  totals: { items: 1234.5 },
  address: {
    address_id: "00000000-0000-0000-0000-000000000002",
    recipient_name: "Jacob",
    line_1: "1 Refinery Row",
    line_2: null,
    city: "Dallas",
    state: "TX",
    zip: "75201",
  },
  user: { user_name: "Jacob" },
  order_items: [
    {
      quantity: 2,
      price: 100,
      product: { name: "1 oz Gold Eagle" },
    },
  ],
  ...over,
});

const spots = [{ name: "Gold", ask: 4000 }];

test("the supplier email renders the order it was given", () => {
  const html = renderSalesOrderToSupplierEmail({
    firstName: "Refiner",
    url: "https://example.com/orders",
    order: order(),
    spots,
  });

  assert.ok(html.includes("1 Refinery Row"), "the street is missing");
  assert.ok(html.includes("Dallas"), "the city is missing");
  assert.ok(html.includes("$4000.00"), "the spot price is missing");
  assert.ok(html.includes("1 oz Gold Eagle"), "the line item is missing");
  assert.ok(html.includes("200.00"), "the line subtotal is missing");
  assert.ok(html.includes("1234.50"), "the order total is missing");
  assert.ok(html.includes("SO - 000055"), "the order number is not formatted");
});

// Production sales order 55: address_id NULL, supplier attached, order_sent true - rendering its email threw. The service now refuses that case outright, but the renderer must not be the thing that decides.
test("an order with no address renders rather than throwing", () => {
  const html = renderSalesOrderToSupplierEmail({
    firstName: "Refiner",
    url: "https://example.com/orders",
    order: order({ address: null }),
    spots,
  });

  assert.ok(html.length > 500, "no document was produced");
  assert.ok(!html.includes("null"), "a null reached the page as the word 'null'");
  assert.ok(html.includes("&mdash;"), "a missing address field rendered as nothing at all");
  // The rest of the message still has to be there - dropping the order would still pass the assertions above.
  assert.ok(html.includes("1 oz Gold Eagle"), "the line item was lost");
  assert.ok(html.includes("1234.50"), "the order total was lost");
});

test("a spot with no ask renders rather than throwing", () => {
  const html = renderSalesOrderToSupplierEmail({
    firstName: "Refiner",
    url: "https://example.com/orders",
    order: order(),
    spots: [{ name: "Gold", ask: null }],
  });

  assert.ok(html.includes("Gold"), "the metal row is missing");
  assert.ok(!html.includes("$null"), "a null ask rendered as a price");
  assert.ok(!html.includes("$0.00"), "a missing ask rendered as a spot of zero");
  assert.ok(html.includes("&mdash;"), "a missing ask rendered as nothing at all");
});

// Checks the substitution actually happens - a renamed template marker would otherwise ship literally to a customer.
test("a template with no url falls back rather than emitting an empty href", () => {
  const html = renderOrderPricedEmail({ firstName: "Jacob" });
  assert.ok(html.includes("Jacob"), "the name was not substituted");
  assert.ok(html.includes("doradometals.com"), "no url was substituted");
  assert.ok(!html.includes("[First Name]"), "a placeholder survived");
  assert.ok(!html.includes("[URL]"), "a placeholder survived");
  assert.ok(!/offer/i.test(html), "offer language survived in customer mail");
});
