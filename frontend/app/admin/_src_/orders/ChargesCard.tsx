'use client'

import type { OrderTotals } from '@dorado/contracts'

import { CardRow, OrderCard } from './OrderCard'
import { money, ounces } from './format'

export type ChargesCardProps = {
  totals: OrderTotals | null
  showShipping: boolean
  showPoolOz: boolean
  chargeLabel: string
  poolOz?: number | null
  refinerFee?: number | null
}

// What comes off the order before the money moves. Shipping shows only for a
// shipment; Pool Oz Remediated only where a refiner pool is in play.
export function ChargesCard({
  totals,
  showShipping,
  showPoolOz,
  chargeLabel,
  poolOz,
  refinerFee,
}: ChargesCardProps) {
  const charge = refinerFee ?? totals?.payout_fee ?? totals?.surcharge ?? null
  const oz = poolOz ?? totals?.pool_oz_deducted ?? null

  return (
    <OrderCard title="Charges" summary={money(charge)}>
      <CardRow label={chargeLabel} value={money(charge)} />
      {showShipping && <CardRow label="Shipping Charge" value={money(totals?.shipping ?? null)} />}
      {showPoolOz && <CardRow label="Pool Oz Remediated" value={ounces(oz)} />}
    </OrderCard>
  )
}
