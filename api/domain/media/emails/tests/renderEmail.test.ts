import { test } from "vitest";
import assert from "node:assert/strict";
import {
  renderSalesOrderToSupplierEmail,
  renderOrderPricedEmail,
} from "#domain/media/emails/utils/renderEmail.ts";
import type { OrderPricing, OrderView } from "@dorado/contracts";

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

const labels = {
  metals: new Map([[GOLD, "Gold"]]),
  services: new Map<string, string>(),
  packages: new Map<string, string>(),
};
const asks = new Map<string, number | null>([[GOLD, 4000]]);
const pricing = {
  order_id: "00000000-0000-4000-8000-000000000000",
  direction: "sale",
  spots_at: new Date().toISOString(),
  spots_locked: false,
  items: [
    {
      id: "line-1",
      kind: "product",
      source: "stored",
      metal_id: GOLD,
      metal: "Gold",
      content: 1,
      quantity: 2,
      premium: 1,
      retier_premium: null,
      unit_price: 100,
      line_total: 200,
    },
  ],
  unpriceable: [],
  scrap_total: 0,
  bullion_total: 200,
  items_total: 200,
  shipping_charge: 0,
  payout_fee: 0,
  total: 200,
  declared_value: 200,
} as OrderPricing;

test("the supplier email renders the order it was given", () => {
  const html = renderSalesOrderToSupplierEmail({
    firstName: "Refiner",
    url: "https://example.com/orders",
    order: order(),
    asks,
    pricing,
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

test("an order with no address renders rather than throwing", () => {
  const html = renderSalesOrderToSupplierEmail({
    firstName: "Refiner",
    url: "https://example.com/orders",
    order: order({ address: null }),
    asks,
    pricing,
    labels,
  });

  assert.ok(html.length > 500, "no document was produced");
  assert.ok(!html.includes("null"), "a null reached the page as the word 'null'");
  assert.ok(html.includes("&mdash;"), "a missing address field rendered as nothing at all");
  assert.ok(html.includes("1 oz Gold Eagle"), "the line item was lost");
  assert.ok(html.includes("1234.50"), "the order total was lost");
});

test("a spot with no ask renders rather than throwing", () => {
  const html = renderSalesOrderToSupplierEmail({
    firstName: "Refiner",
    url: "https://example.com/orders",
    order: order(),
    asks: new Map([[GOLD, null]]),
    pricing,
    labels,
  });

  assert.ok(html.includes("Gold"), "the metal row is missing");
  assert.ok(!html.includes("$null"), "a null ask rendered as a price");
  assert.ok(!html.includes("$0.00"), "a missing ask rendered as a spot of zero");
  assert.ok(html.includes("&mdash;"), "a missing ask rendered as nothing at all");
});

test("a template with no url falls back rather than emitting an empty href", () => {
  const html = renderOrderPricedEmail({ firstName: "Jacob" });
  assert.ok(html.includes("Jacob"), "the name was not substituted");
  assert.ok(html.includes("doradometals.com"), "no url was substituted");
  assert.ok(!html.includes("[First Name]"), "a placeholder survived");
  assert.ok(!html.includes("[URL]"), "a placeholder survived");
  assert.ok(!/offer/i.test(html), "offer language survived in customer mail");
});
