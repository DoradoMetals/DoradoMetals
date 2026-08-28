// The refiner's copy of a sales order, rendered.
//
// Pure: it reads template files and substitutes. No database, no transport, no
// Chromium.
//
// It is tested because typing it found two live TypeErrors, both on values the
// wire contract already declares nullable, and both thrown at the worst
// possible moment. features/sales-orders/service.js sends this message AFTER
// the transaction that attaches the supplier, creates the outbound shipment and
// sets order_sent - deliberately, so that a failure leaves an order marked sent
// rather than metal shipped against a rolled-back record. Anything that throws
// in here is therefore silent: the order says it went, and nobody was told.
//
// Both were confirmed against the pre-conversion file before being fixed:
//   `addr.line_1`         -> TypeError: Cannot read properties of null
//   `s.ask_spot.toFixed`  -> TypeError: Cannot read properties of null
import test from "node:test";
import assert from "node:assert/strict";
import {
  renderSalesOrderToSupplierEmail,
  renderOfferSentEmail,
} from "#features/media/emails/utils/renderEmail.ts";

// The wire shape, not a convenience object: SalesOrder says address
// and totals are nullable, and an item's price and quantity are. The fixture
// speaks the converted names (D84) because that is what the service hands the
// renderer now.
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

// PRODUCTION SALES ORDER 55: address_id NULL, a supplier attached, order_sent
// true. Rendering its supplier email threw, which is why the service now
// refuses it outright - but the renderer must not be the thing that decides.
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
  // The rest of the message still has to be there - a document that renders by
  // dropping the order would pass the assertions above.
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

// The other renderers take a name and a URL and nothing else. This one checks
// the substitution actually happens, because a template whose marker was
// renamed would otherwise ship the marker to a customer.
test("a template with no url falls back rather than emitting an empty href", () => {
  const html = renderOfferSentEmail({ firstName: "Jacob", offerExpiration: "in 7 days" });
  assert.ok(html.includes("Jacob"), "the name was not substituted");
  assert.ok(html.includes("in 7 days"), "the expiration was not substituted");
  assert.ok(html.includes("doradometals.com"), "no url was substituted");
  assert.ok(!html.includes("[First Name]"), "a placeholder survived");
  assert.ok(!html.includes("[URL]"), "a placeholder survived");
});
