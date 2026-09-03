// WHAT THE BUSINESS CHARGES FOR METAL - the ask side of features/pricing.
//
// Moved here from features/sales-orders/utils/calculations.ts under ruling 24,
// with the bid side. Nothing below changed in the move.
//
// What a sales order costs.
//
// The mirror of features/pricing/bid.ts: that one values
// metal the business is buying, this one prices metal it is selling. They share
// no code and should not - a bid and an ask are different sums with different
// defaults. Most visibly, a metal absent from `spots` throws on the purchase
// side and prices at zero here, which the tests pin on both.
//
// TWO DIVERGENCES FROM THE FRONTEND'S COPY OF THIS SUM, found while converting
// this file and deliberately left alone: changing either changes money that has
// already been stored, which is not a type conversion's job. Both are written
// up in FOLLOWUPS.md.
//
//   1. calculateCardCharge surcharges everything that is not "ACH" at 2.9%,
//      CREDIT and WIRE included - and the checkout labels both of those "No
//      Fee" (frontend/features/orders/salesOrders/types.ts). Nothing on the
//      server refuses a CREDIT order whose funds fall short; only
//      paymentSelect.tsx does, by flipping the method back to CARD when
//      beginningFunds < baseTotal. Production has never reached it: all 8
//      orders that applied funds were covered in full, so
//      subject_to_charges_amount was 0 and no surcharge was taken.
//
//   2. The rate is chosen by a payment_method the client sends, and the Stripe
//      intent is created with automatic_payment_methods enabled, so whatever
//      method is actually used is never reconciled against the one that set the
//      rate. Declaring ACH and paying by card costs the business the 2.4%
//      difference. Production has one collected sales order and it is card at
//      the card rate, so this has not happened either.
//
// AND ONE ASYMMETRY WITHIN THIS FILE. calculateItemTotals defaults a missing
// quantity to 1, calculateSalesTax does not - so a line with no quantity would
// be charged for one and taxed on none. It cannot currently happen: every
// caller but /tax/get_sales_tax passes items through
// productService.getItemsFromServer, which sets `quantity: ... ?? 0`. See the
// note on `item.quantity!` below.
// Declared once, in spot.ts - see the note on the bid side.
import type { PricingSpot, Spots } from "#domain/pricing/spot.ts";
export type { PricingSpot, Spots } from "#domain/pricing/spot.ts";

// What pricing needs of a line, which is emphatically NOT SalesOrderItem.
// That is a line on a *saved* order - the product nested underneath, a premium
// frozen at the time of sale. These functions run before the order exists, over
// catalogue rows (Bullion) that the cart named and getItemsFromServer read
// back from the database, with `quantity` overlaid from the request.
//
// Every field is optional because /tax/get_sales_tax prices the request body as
// it arrives, unread and unjoined. Declaring them required would be a type that
// describes one caller and lies about the other.
type PriceableItem = {
  metal_type?: string | null;
  content?: number | null;
  ask_premium?: number | null;
  quantity?: number | null;
};

// The same line once taxService.attachSalesTaxToItems has run. The rate is not
// optional: that function always sets it, from a query that COALESCEs to 0.
type TaxedItem = PriceableItem & { sales_tax_rate: number };


// Only dorado_funds is ever read, so only dorado_funds is required. The
// checkout passes a better-auth session user and the admin path passes a row
// from exchange.users; naming either type here would reject the other.
type FundedUser = { dorado_funds?: number | null };

export type OrderPrices = {
  item_total: number;
  base_total: number;
  shipping_charge: number;
  beginning_funds: number;
  ending_funds: number;
  pre_charges_amount: number;
  subject_to_charges_amount: number;
  post_charges_amount: number;
  charges_amount: number;
  sales_tax: number;
  order_total: number;
};

export function calculateItemAsk(item: PriceableItem, spots: Spots): number {
  const spot = spots?.find((s: PricingSpot) => s.name === item.metal_type);
  return (
    (item?.content ?? 0) * ((spot?.ask ?? 0) * (item?.ask_premium ?? 0))
  );
}

export function calculateCardCharge(
  order_total: number,
  payment_method: string | null | undefined
): number {
  if (payment_method === "ACH") {
    return order_total * 0.005;
  } else {
    return order_total * 0.029;
  }
}

// This held its own copy of calculateItemAsk's expression, character for
// character, and now calls it. Two copies of one money sum drifting apart is
// exactly the bug the purchase-order file's header describes - an invoice and a
// packing list disagreeing by $3,236.11 - so the duplicate is worth removing
// even though it had not yet drifted here. The arithmetic is unchanged, and
// "item totals apply quantity" pins the result.
export function calculateItemTotals(items: PriceableItem[], spots: Spots): number {
  const baseTotal = items.reduce((acc: number, item: PriceableItem) => {
    const price = calculateItemAsk(item, spots);

    const quantity = item.quantity ?? 1;
    return acc + price * quantity;
  }, 0);

  return baseTotal;
}

export function getShippingCharge(
  item_total: number,
  shipping_service: string | null | undefined
): number {
  return item_total > 1000
    ? 0
    : shipping_service === "OVERNIGHT"
    ? 50
    : shipping_service === "STANDARD"
    ? 25
    : 0;
}

// `item.quantity!` preserves the arithmetic rather than asserting a fact. A
// null quantity multiplies to 0 in JavaScript, which is the behaviour described
// in the header and pinned by nothing, because no caller can currently produce
// it. Writing `item.quantity ?? 1` here would agree with calculateItemTotals
// and would change the tax on an order - a real change to stored money, made
// silently inside a type conversion. It belongs in its own commit, with
// Jacob's answer on which of the two is right.
export function calculateSalesTax(items: TaxedItem[], spots: Spots): number {
  return items.reduce((acc: number, item: TaxedItem) => {
    return (
      acc + calculateItemAsk(item, spots) * item.quantity! * item.sales_tax_rate
    );
  }, 0);
}

export function calculateSalesOrderTotal(
  items: TaxedItem[],
  using_funds: boolean | null | undefined,
  spots: Spots,
  user: FundedUser,
  shipping_service: string | null | undefined,
  payment_method: string | null | undefined
): OrderPrices {
  const item_total = calculateItemTotals(items, spots);
  const shipping_charge = getShippingCharge(item_total, shipping_service);
  const sales_tax = calculateSalesTax(items, spots);

  const base_total = item_total + shipping_charge + sales_tax;

  const beginning_funds = user.dorado_funds ?? 0;
  let appliedFunds = using_funds ? Math.min(beginning_funds, base_total) : 0;

  // THE CARD REMAINDER IS EITHER ZERO OR CHARGEABLE, and this cap is what
  // retired the $10 floor (D199). Stripe will not create a charge below $0.50,
  // and the old answer was Math.max(rawAmount, 1000) at intent time - which
  // billed a $3 balance as $10. The honest answer lives here in pricing: when
  // applied credit would leave a sliver between $0.00 and $0.50, apply slightly
  // LESS credit so the card pays exactly Stripe's minimum. The customer keeps
  // the sliver as credit rather than being overcharged for it.
  //
  // A base_total below $0.50 with insufficient credit cannot be fixed by this
  // cap (there is no credit to hold back) - that order is refused downstream
  // at intent time, and no product this business sells costs 49 cents.
  const STRIPE_MINIMUM_CHARGE = 0.5;
  const cardRemainder = base_total - appliedFunds;
  if (cardRemainder > 0 && cardRemainder < STRIPE_MINIMUM_CHARGE) {
    appliedFunds = Math.max(0, base_total - STRIPE_MINIMUM_CHARGE);
  }
  const ending_funds = beginning_funds - appliedFunds;

  const pre_charges_amount = appliedFunds;
  const subject_to_charges_amount = base_total - appliedFunds;

  let post_charges_amount = subject_to_charges_amount;
  let charges_amount = 0;
  if (subject_to_charges_amount > 0) {
    charges_amount = calculateCardCharge(
      subject_to_charges_amount,
      payment_method
    );
    post_charges_amount += charges_amount;
  }

  const order_total = pre_charges_amount + post_charges_amount;
  return {
    item_total,
    base_total,
    shipping_charge,
    beginning_funds,
    ending_funds,
    pre_charges_amount,
    subject_to_charges_amount,
    post_charges_amount,
    charges_amount,
    sales_tax,
    order_total,
  };
}
