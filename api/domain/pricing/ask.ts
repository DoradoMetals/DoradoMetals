// What the business CHARGES for metal (ask side) — mirrors bid.ts (what it PAYS), and they share no code: different defaults, most visibly that a metal absent from spots throws on the purchase side and prices at zero here (pinned on both).
// TWO KNOWN DIVERGENCES from the frontend's own copy of this sum, deliberately left alone (fixing either changes money already stored, not a type conversion's job — full account in FOLLOWUPS.md):
//   1. calculateCardCharge surcharges everything but ACH at 2.9%, but the checkout UI labels CREDIT and WIRE 'No Fee' too. Not yet hit: every funded order so far was covered in full, so no surcharge was taken.
//   2. The surcharge rate is set by the client-declared payment_method, but Stripe's automatic_payment_methods means the method actually used is never reconciled against it — declaring ACH and paying by card would undercharge by 2.4%. Not yet hit: production's one collected sale used the card rate.
// AND ONE ASYMMETRY WITHIN THIS FILE: calculateItemTotals defaults a missing quantity to 1, calculateSalesTax does not — cannot currently happen, since every caller but /tax/get_sales_tax passes items through getItemsFromServer, which sets quantity ?? 0.
// Declared once, in spot.ts - see the note on the bid side.
import type { PricingSpot, Spots } from "#domain/pricing/spot.ts";
export type { PricingSpot, Spots } from "#domain/pricing/spot.ts";

// NOT SalesOrderItem — that's a line on a *saved* order; this runs BEFORE the order exists, over catalogue rows with quantity overlaid from the request.
// Every field is optional because /tax/get_sales_tax prices the raw request body, unread and unjoined — required fields here would describe one caller and lie about the other.
type PriceableItem = {
  metal_type?: string | null;
  content?: number | null;
  ask_premium?: number | null;
  quantity?: number | null;
};

// The same line once taxService.attachSalesTaxToItems has run. The rate is not
// optional: that function always sets it, from a query that COALESCEs to 0.
type TaxedItem = PriceableItem & { sales_tax_rate: number };


// Only dorado_funds is read — checkout passes a better-auth session user, admin passes an exchange.users row; naming either type would reject the other.
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

// Calls calculateItemAsk rather than duplicating its expression — two copies drifting apart is the exact bug bid.ts's header describes.
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

// `item.quantity!` preserves existing arithmetic (null multiplies to 0) rather than asserting a fact — no caller can currently produce a null, so this is unproven, not verified safe.
// Changing it to `?? 1` (matching calculateItemTotals) would alter stored tax amounts — a real money change that needs its own commit and Jacob's call on which is right.
export function calculateSalesTax(items: TaxedItem[], spots: Spots): number {
  return items.reduce((acc: number, item: TaxedItem) => {
    return (
      acc + calculateItemAsk(item, spots) * item.quantity! * item.sales_tax_rate
    );
  }, 0);
}

// CREDIT IS NOT A CHOICE (Jacob, 2026-09-03: "No reason to let them make a
// choice"). A balance is applied whenever one exists, capped at the order's
// own total; the old `using_funds` flag is gone from the wire and from here.
export function calculateSalesOrderTotal(
  items: TaxedItem[],
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
  let appliedFunds = Math.min(beginning_funds, base_total);

  // The card remainder is either $0 or chargeable — retired the old $10 floor (which billed a $3 balance as $10). When applied credit would leave a sliver between $0.00 and $0.50 (below Stripe's minimum), apply slightly LESS credit so the card pays exactly $0.50; the customer keeps the sliver as credit instead of being overcharged.
  // A base_total under $0.50 with insufficient credit can't be fixed here (no credit to hold back) — refused downstream at intent time; no product costs 49 cents.
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
