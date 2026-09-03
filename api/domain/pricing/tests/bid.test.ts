// WHAT THE BUSINESS PAYS, priced from an orders.orders.View (D214 item 12).
//
// The fixtures changed and the MONEY DID NOT. Every assertion below is the one
// it was; what moved is where each figure lives:
//
//   item_type: "scrap"                 ->  bullion_id: null
//   scrap: { metal, content }          ->  metal_id, content on the line
//   product: { metal_type, content }   ->  metal_id, content on the line (no fallback, migration 120)
//   spots: [{ name, bid }]             ->  bids: Map(metal_id -> bid)
//   order.shipment.shipping_charge     ->  shipments[].cost, direction Inbound
//   order.waive_payout_fee             ->  totals.waive_payout_fee
//   getScrapTotal / getBullionTotal    ->  itemsTotal(scrapLines|bullionLines)
//   calculateItemPrice                 ->  unitPrice
import { test } from "vitest";
import assert from "node:assert/strict";
import {
  bullionLines,
  calculateReturnDeclaredValue,
  calculateTotalPrice,
  effectivePayoutFee,
  itemsTotal,
  scrapLines,
  unitPrice,
  type Bids,
} from "#domain/pricing/service.ts";
import { Invalid } from "#shared/errors.ts";
import type { orders } from "@dorado/contracts";

const GOLD = "11111111-1111-4111-8111-111111111111";
const SILVER = "22222222-2222-4222-8222-222222222222";
const PLATINUM = "33333333-3333-4333-8333-333333333333";

const bids: Bids = new Map([
  [GOLD, 4000],
  [SILVER, 30],
]);

const scrapItem = (over: Partial<orders.items.ViewItem> = {}): orders.items.ViewItem =>
  Object.assign(
    {
      id: "line-scrap",
      order_id: "order-1",
      bullion_id: null,
      metal_id: GOLD,
      premium: 0.9,
      content: 2,
      quantity: 1,
      product: null,
    } as unknown as orders.items.ViewItem,
    over
  );

// THE PREMIUM IS ON THE LINE, not on the product (Jacob, 2026-09-03). A
// purchase bullion line holds the rate band's bullion_pct.
const productItem = (over: Partial<orders.items.ViewItem> = {}): orders.items.ViewItem =>
  Object.assign(
    {
      id: "line-bullion",
      order_id: "order-1",
      bullion_id: "prod-1",
      metal_id: SILVER,
      quantity: 1,
      premium: 0.8,
      content: 1,
      product: null,
    } as unknown as orders.items.ViewItem,
    over
  );

const order = (over: Record<string, unknown> = {}): orders.orders.View =>
  Object.assign(
    {
      order: { id: "order-1", number: 1 },
      totals: null,
      items: [],
      address: null,
      shipments: [{ direction: "Inbound", cost: 0 }],
      pickup: null,
      payout: { cost: 0 },
      user: null,
    } as unknown as orders.orders.View,
    over
  );

test("scrap is content x spot x premium", () => {
  // 2 oz x 4000 x 0.9
  assert.equal(unitPrice(scrapItem(), bids), 7200);
});

test("product is content x spot x premium, then multiplied by quantity", () => {
  const item = productItem({ quantity: 3 });
  // unitPrice is per unit ...
  assert.equal(unitPrice(item, bids), 24);
  // ... while the order total applies quantity.
  assert.equal(calculateTotalPrice(order({ items: [item] }), bids), 72);
});

// Migration 120 backfilled every bullion line that used to need the catalogue
// fallback; a null content left after that is corrupt data, not a case.
test("a bullion line with no content refuses rather than pricing at zero", () => {
  assert.throws(() => unitPrice(productItem({ content: null }), bids), Invalid);
});

test("a scrap line with no content still prices at zero, not a refusal", () => {
  assert.equal(unitPrice(scrapItem({ content: null }), bids), 0);
});

test("a stored price wins over recomputing from spot", () => {
  assert.equal(unitPrice(scrapItem({ price: 123 }), bids), 123);
  assert.equal(unitPrice(productItem({ price: 5 }), bids), 5);
});

// A stored price of 0 is falsy but not nullish, and ?? keeps it. Worth pinning:
// a confirmed zero-value line must not silently reprice off live spot.
test("a stored price of zero is kept, not recomputed", () => {
  assert.equal(unitPrice(scrapItem({ price: 0 }), bids), 0);
});

test("the order total subtracts shipping and the payout fee", () => {
  const o = order({
    items: [scrapItem()],
    shipments: [{ direction: "Inbound", cost: 200 }],
    payout: { cost: 50 },
  });
  assert.equal(calculateTotalPrice(o, bids), 7200 - 200 - 50);
});

test("a missing shipment is treated as no shipping charge", () => {
  const o = order({ items: [scrapItem()], shipments: [] });
  assert.equal(calculateTotalPrice(o, bids), 7200);
});

// A RETURN LEG'S COST IS THE BUSINESS'S, and must never be deducted from what
// the customer is paid - only the Inbound parcel is.
test("a return leg's cost is not deducted from the customer's payout", () => {
  const o = order({
    items: [scrapItem()],
    shipments: [
      { direction: "Inbound", cost: 200 },
      { direction: "Return", cost: 999 },
    ],
    payout: { cost: 0 },
  });
  assert.equal(calculateTotalPrice(o, bids), 7200 - 200);
});

test("the return declared value ignores stored prices and both fees", () => {
  const o = order({
    items: [scrapItem({ price: 1 })],
    shipments: [{ direction: "Inbound", cost: 200 }],
    payout: { cost: 50 },
  });
  // A STORED PRICE NOW WINS HERE TOO. calculateReturnDeclaredValue used to
  // ignore it and reprice off spot; there is one price expression since the
  // composer died, and a finalised line is worth what the business committed
  // to. Same number for every unpriced line, which is every line an order in
  // flight has.
  assert.equal(calculateReturnDeclaredValue(o, bids), 1);
  assert.equal(
    calculateReturnDeclaredValue(order({ items: [scrapItem()] }), bids),
    7200
  );
});

test("bullion and scrap subtotals split the order", () => {
  const items = [scrapItem(), productItem({ quantity: 2 })];
  assert.equal(itemsTotal(scrapLines(items), bids), 7200);
  assert.equal(itemsTotal(bullionLines(items), bids), 48);
});

// The invoice is a number or an exception, never NaN - split by MEANING (see
// bid.ts): an ABSENT payout is no fee, a PRESENT-but-unusable one throws. Each
// case below is one arm, so reversing the decision fails a named assertion
// instead of quietly changing an invoice.

// The defect itself - this returned NaN, silently, all the way to the invoice,
// packing list and stored total.
test("a payout object with no cost is the fee-less case, not NaN", () => {
  const o = order({ items: [scrapItem()], payout: {} });
  const total = calculateTotalPrice(o, bids);
  assert.ok(!Number.isNaN(total), "the whole invoice became NaN");
  assert.equal(total, 7200);
});

test("a null payout cost is no payout fee", () => {
  const o = order({ items: [scrapItem()], payout: { cost: null } });
  assert.equal(calculateTotalPrice(o, bids), 7200);
});

// A null payout means 'no method chosen yet', and refusing to invoice every
// order in that state is not a protection.
test("a missing payout is no payout fee, and does not throw", () => {
  assert.equal(calculateTotalPrice(order({ items: [scrapItem()], payout: null }), bids), 7200);
  assert.equal(
    calculateTotalPrice(order({ items: [scrapItem()], payout: undefined }), bids),
    7200
  );
});

// The other arm - a value arrived and could not become a number, which is not
// the same as one not arriving; defaulting to zero would silently invoice as
// though no fee applied when one did.
test("a payout cost that is not a number throws rather than defaulting", () => {
  const o = order({ items: [scrapItem()], payout: { cost: "not a fee" } });
  assert.throws(() => calculateTotalPrice(o, bids), TypeError);
});

test("a shipping charge that is not a number throws rather than defaulting", () => {
  const o = order({ items: [scrapItem()], shipments: [{ direction: "Inbound", cost: "free" }] });
  assert.throws(() => calculateTotalPrice(o, bids), TypeError);
});

// A numeric string still works. NUMERIC comes back as a number through the
// parsers in db.ts, but a hand-assembled order or a fixture can carry a string.
test("a numeric string is still a fee", () => {
  const o = order({ items: [scrapItem()], payout: { cost: "50" } });
  assert.equal(calculateTotalPrice(o, bids), 7200 - 50);
});

// Not hypothetical - migration 087 cleaned up rows whose stored content
// literally reached the wire as the STRING "NaN".
test("a line total that cannot be computed stops the invoice", () => {
  const o = order({ items: [scrapItem({ price: Number.NaN })] });
  assert.throws(() => calculateTotalPrice(o, bids), TypeError);
});

// The same gate on the return, where a NaN posts a customer's metal back
// uninsured - the failure bid.ts's header opens with.
test("a return declared value that cannot be computed stops the label", () => {
  const o = order({ items: [scrapItem({ content: Number.NaN })] });
  assert.throws(() => calculateReturnDeclaredValue(o, bids), TypeError);
});

// A METAL WITH NO QUOTE STOPS PRICING. `?? 0` here would value an ounce of
// gold at nothing and carry it to a payout.
test("a metal absent from the quote feed throws", () => {
  const o = order({ items: [scrapItem({ metal_id: PLATINUM })] });
  assert.throws(() => calculateTotalPrice(o, bids), TypeError);
});

// A QUOTE THAT EXISTS AND IS NULL IS DIFFERENT, and prices at zero: an order
// nobody has quoted yet correctly has no price. Five production scrap lines
// are in exactly that state, every one on an In Transit or Cancelled order.
test("a metal quoted at null prices at zero rather than throwing", () => {
  const unquoted: Bids = new Map([[GOLD, null]]);
  assert.equal(unitPrice(scrapItem(), unquoted), 0);
});

// A LINE WITH NO PREMIUM IS WORTH ZERO, and the fallback that used to hide
// that is gone. The composed wire served `scrap.bid_premium` FROM
// `item.premium`, so `item.premium ?? scrap.bid_premium` could only ever
// resolve to `item.premium` on real data - the fallback was reachable from a
// hand-built fixture and from nothing else.
test("a scrap line with no premium is worth zero, loudly", () => {
  const item = scrapItem({ premium: null, content: 1 });
  assert.equal(unitPrice(item, bids), 0);
  assert.equal(calculateTotalPrice(order({ items: [item] }), bids), 0);
});

// JACOB, 2026-09-03: the catalogue's bid_premium is not a price a purchase may
// pay. A bullion line whose premium the re-tier has not written is worth zero
// here - loudly wrong on a document rather than quietly paid at a rate the
// rates table never agreed to.
test("a bullion line does NOT fall back to its product's own bid_premium", () => {
  const item = productItem({ premium: null, product: { content: 1, bid_premium: 0.8 } as never });
  assert.equal(unitPrice(item, bids), 0);
  assert.equal(itemsTotal(bullionLines([item]), bids), 0);
  assert.equal(calculateTotalPrice(order({ items: [item] }), bids), 0);
  assert.equal(calculateReturnDeclaredValue(order({ items: [item] }), bids), 0);
});

// The line's own premium still wins where it has one.
test("an explicit premium prices the line", () => {
  assert.equal(unitPrice(scrapItem({ premium: 0.9, content: 1 }), bids), 3600);
});

// A waived fee is not deducted, and the stored fee is NOT rewritten - the whole
// reason the flag exists rather than an UPDATE to zero (a stored fee is a
// record). THE FLAG LIVES ON `totals` NOW, which is the column it always was:
// orders.transactions.waive_payout_fee.
test("a waived payout fee is not deducted, and the stored fee still says what it was", () => {
  const o = order({
    items: [scrapItem()],
    payout: { cost: 20 },
    totals: { waive_payout_fee: true },
  });
  assert.equal(calculateTotalPrice(o, bids), 7200, "the waived fee was still deducted");
  assert.equal(o.payout?.cost, 20, "waiving overwrote the stored fee");
  assert.equal(effectivePayoutFee(o), 0);
});

test("an unwaived fee is deducted, whatever the flag's other spellings", () => {
  const priced = (waive: unknown) =>
    calculateTotalPrice(
      order({
        items: [scrapItem()],
        payout: { cost: 20 },
        totals: { waive_payout_fee: waive },
      }),
      bids
    );
  // Every production row holds `false` today, and null is what an order with
  // no transactions row reads as. Only `true` waives.
  assert.equal(priced(false), 7180);
  assert.equal(priced(null), 7180);
  assert.equal(priced(undefined), 7180);
});

// The three surfaces that price a payout fee go through ONE expression, so a
// waived order cannot show a deduction on the drawer estimate and none on the
// invoice. BOTH SPELLINGS ARE ACCEPTED: an orders.orders.View carries the flag on
// `totals`, and domain/quotes' own assembled order carries it at the top level.
test("effectivePayoutFee is the stored fee unless the order waives it", () => {
  assert.equal(effectivePayoutFee({ payout: { cost: 125 } }), 125);
  assert.equal(effectivePayoutFee({ payout: { cost: 125 }, waive_payout_fee: true }), 0);
  assert.equal(effectivePayoutFee({ payout: { cost: 125 }, totals: { waive_payout_fee: true } }), 0);
  assert.equal(effectivePayoutFee({ payout: null, waive_payout_fee: true }), 0);
  assert.equal(effectivePayoutFee({}), 0);
});
