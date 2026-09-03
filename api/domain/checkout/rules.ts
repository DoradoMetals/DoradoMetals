// PURCHASE AND SALE DIFFER BY ONE COLUMN (Jacob), and everything that differs
// between them follows from which way the money moves. This file is that
// difference, whole: pure functions, no database, no request.
//
//   sale     - the customer pays us. A Stripe intent is drafted, and the
//              payment methods offered are the sale-direction rows.
//   purchase - we pay the customer. There is no intent; the payout step
//              records where the money goes instead.
//
// The payment methods a step offers are the rows of the SAME direction, which
// is why nothing here translates one into the other.
import { Invalid } from "#shared/errors.ts";

export type Direction = "sale" | "purchase";

export function assertDirection(direction: unknown): Direction {
  if (direction !== "sale" && direction !== "purchase") {
    throw new Invalid(`direction must be 'sale' or 'purchase'`);
  }
  return direction;
}

// Money comes IN on a sale, so that is the only direction with a card step.
export function draftsPaymentIntent(direction: Direction): boolean {
  return direction === "sale";
}

// Money goes OUT on a purchase, so that is the only direction with a payout
// step (D210).
export function hasPayoutStep(direction: Direction): boolean {
  return direction === "purchase";
}

// WHICH VISIBILITY FLAG GOVERNS A LINE. `display` governs buying from the
// business and `sell_display` governs selling to it. A product can legitimately
// be one and not the other, so neither is a proxy for the other.
export function livenessFlag(direction: Direction): "display" | "sell_display" {
  return direction === "sale" ? "display" : "sell_display";
}

// WHETHER A CART LINE STORES THE PRODUCT'S PREMIUM. A purchase line keeps the
// catalogue's bid premium as a DISPLAY figure while the basket has no quote; a
// sale line records none.
//
// IT IS NOT WHAT THE ORDER PAYS, AND IT NEVER WAS THE QUOTE'S NUMBER EITHER.
// domain/quotes prices a sell cart from the rate bands, and since 2026-09-03
// domain/orders re-tiers EVERY purchase line - bullion from bullion_pct - the
// moment the checkout becomes an order. So this column is overwritten at
// placement and nothing downstream of the order reads it. Left standing
// because the sell cart shows it while the customer is signed out and no quote
// has landed; a null there would show a rate of zero.
export function carriesProductPremium(direction: Direction): boolean {
  return direction === "purchase";
}
