// shared/utils/auctions.ts (or wherever)
export function calcStartingBidPerLot(args: {
  ask: number
  content: number
  premium: number
  qtyPerLot: number
  feeRate?: number // default 0.08
}): number {
  const { ask, content, premium, qtyPerLot, feeRate = 0.08 } = args

  const base =
    Number(ask) * Number(content) * Number(premium) * Number(qtyPerLot)

  if (!Number.isFinite(base) || base <= 0) return 0

  return Math.ceil(base * (1 + feeRate))
}