// What each payout method costs the customer, server-side.
//
// D97/D82. The fee lived ONLY in the browser - frontend/features/payouts/
// types.ts's `payoutOptions` - and the checkout both displayed it and sent it
// back on the create. A number the server has no opinion about is a number the
// server cannot check, and the bug that surfaced it was the headline
// "Estimated Payout" reading $20 high because the client's own arithmetic
// dropped the deduction.
//
// THESE ARE DEFAULTS FOR A NEW ORDER, NOT THE TRUTH ABOUT AN OLD ONE.
// exchange.payouts.cost is per-row and has been overridden in production -
// measured, 61 rows:
//
//   ACH             0     x11
//   DORADO_ACCOUNT  0     x2
//   ECHECK          0     x39,  75  x1,  125  x1
//   WIRE           20     x6,    0  x2
//
// So the method does NOT determine the fee for a payout that already exists;
// eleven of those rows disagree with the table below. A quote for a cart has no
// payout row yet and this is the right default for it, but nothing here may be
// used to re-derive the fee of a stored payout - that number is on the row, and
// features/quotes' orderQuote already reads it from there.
//
// Values verified byte-for-byte against payoutOptions on 2026-08-28. If the
// two ever disagree the frontend is wrong by construction, because it stops
// computing this at all once D97's handoff lands.
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
// NULL RATHER THAN ZERO, deliberately: a typo'd method must not silently price
// as free. The caller decides whether that is a 400 or a "not chosen yet".
export function payoutFee(method: unknown): number | null {
  return isPayoutMethod(method) ? PAYOUT_METHOD_FEES[method] : null;
}
