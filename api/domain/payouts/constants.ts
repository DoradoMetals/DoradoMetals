// What each payout method costs the customer, server-side.
//
// DEFAULTS FOR A NEW ORDER ONLY, not the truth for an existing one: exchange.payouts.cost is per-row and overridden in production (4 of 62 rows disagree, both directions).
// A quote for a cart has no payout row yet and uses this default; a stored payout's fee is read from its own row (features/quotes' orderQuote), never re-derived here.
export const PAYOUT_METHOD_FEES: Readonly<Record<string, number>> = Object.freeze({
  ACH: 0,
  WIRE: 20,
  ECHECK: 0,
  DORADO_ACCOUNT: 0,
});

export type PayoutMethod = keyof typeof PAYOUT_METHOD_FEES;

export function isPayoutMethod(value: unknown): value is PayoutMethod {
  return typeof value === "string" && value in PAYOUT_METHOD_FEES;
}

// The fee for a method, or null when the method is not one we pay out by.
// Null rather than zero, deliberately: a typo'd method must not silently price as free.
export function payoutFee(method: unknown): number | null {
  return isPayoutMethod(method) ? PAYOUT_METHOD_FEES[method] : null;
}
