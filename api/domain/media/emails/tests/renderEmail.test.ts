// The refiner's copy of a sales order, rendered - pure (reads templates, substitutes; no database/transport/Chromium).
// Sent AFTER the transaction that attaches the supplier and marks order_sent - a throw here is silent: the order says it went and nobody is told. Values the wire contract declares nullable (address, ask_spot) must render, not throw.
import test from "node:test";
import assert from "node:assert/strict";
import {
  renderSalesOrderToSupplierEmail,
  renderOrderPricedEmail,
} from "#domain/media/emails/utils/renderEmail.ts";
import type { OrderView } from "@dorado/contracts";

// THE ORDER VIEW (D214 item 12), not a convenience object: the address and the
// money are nullable rows, an item's price and quantity are nullable columns,
// and the customer's name comes from auth.users rather than from a joined
// `user_name`. A hand-written fixture that drifted from the view is exactly
// the failure this file exists to catch, so it is typed as one.
const GOLD = "11111111-1111-4111-8111-111111111111";

const order = (over: Record<string, unknown> = {}): OrderView =>
  Object.assign(
    {
      order: { id: "00000000-0000-0000-0000-000000000001", number: 55 },
      totals: { items: 1234.5 },
      address: {
        id: "00000000-0000-0000-0000-000000000002",
        line_1: "1 Refinery Row",
        line_2: null,
        city: "Dallas",
        state: "TX",
        zip: "75201",
      },
      user: { id: "u1", name: "Jacob", email: "jacob@example.com" },
      items: [
        {
          id: "line-1",
          bullion_id: "prod-1",
          metal_id: GOLD,
          quantity: 2,
          price: 100,
          product: { name: "1 oz Gold Eagle" },
        },
      ],
      shipments: [],
      pickup: null,
      payout: null,
    } as unknown as OrderView,
    over
  );

// The metal names a document prints, and the asks it quotes - both keyed by
// the metal's id, because a line names its metal by id and always has.
const labels = {
  metals: new Map([[GOLD, "Gold"]]),
  services: new Map<string, string>(),
  packages: new Map<string, string>(),
};
const asks = new Map<string, number | null>([[GOLD, 4000]]);

test("the supplier email renders the order it was given", () => {
  const html = renderSalesOrderToSupplierEmail({
    firstName: "Refiner",
    url: "https://example.com/orders",
    order: order(),
    asks,
    labels,
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
    asks,
    labels,
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
    asks: new Map([[GOLD, null]]),
    labels,
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
