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
import { refuse } from "#shared/http/refuse.ts";

export type Direction = "sale" | "purchase";

export function assertDirection(direction: unknown): Direction {
  if (direction !== "sale" && direction !== "purchase") {
    throw refuse(400, `direction must be 'sale' or 'purchase'`);
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

// WHETHER A CART LINE STORES THE PRODUCT'S PREMIUM. A purchase line records the
// bid premium it was quoted at; a sale line records none, because a sale
// premium is a rate banded on the metal total across the whole checkout and is
// resolved when the checkout becomes an order (085).
export function carriesProductPremium(direction: Direction): boolean {
  return direction === "purchase";
}
