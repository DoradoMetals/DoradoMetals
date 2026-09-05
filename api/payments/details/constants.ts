export const PAYOUT_METHOD_FEES: Readonly<Record<string, number>> = Object.freeze({
  ACH: 0,
  WIRE: 20,
  ECHECK: 0,
  DORADO_ACCOUNT: 0,
});

type PayoutMethod = keyof typeof PAYOUT_METHOD_FEES;

export function isPayoutMethod(value: unknown): value is PayoutMethod {
  return typeof value === "string" && value in PAYOUT_METHOD_FEES;
}

export function payoutFee(method: unknown): number | null {
  return isPayoutMethod(method) ? PAYOUT_METHOD_FEES[method] : null;
}
