'use client'

import type { OrderTotals, RefiningTotals } from '@dorado/contracts'

import { CardRow, OrderCard } from './OrderCard'
import { money, ounces } from './format'

export type ChargesCardProps = {
  totals: OrderTotals | null
  showShipping: boolean
  showPoolOz: boolean
  chargeLabel: string
  poolOz?: number | null
  refining?: RefiningTotals | null
}

// What comes off the order before the money moves. Shipping shows only for a
// shipment; Pool Oz Remediated only where a refiner pool is in play. A refiner
// order has no transactions row, so its figures are the `refining.order_money`
// view's.
export function ChargesCard({
  totals,
  showShipping,
  showPoolOz,
  chargeLabel,
  poolOz,
  refining,
}: ChargesCardProps) {
  const charge = refining?.payment_charge ?? totals?.payout_fee ?? totals?.surcharge ?? null
  const oz = poolOz ?? totals?.pool_oz_deducted ?? null

  return (
    <OrderCard title="Charges" summary={money(charge)}>
      <CardRow label={chargeLabel} value={money(charge)} />
      {refining ? <CardRow label="Refiner fee" value={money(refining.fee)} /> : null}
      {showShipping && <CardRow label="Shipping Charge" value={money(totals?.shipping ?? null)} />}
      {showPoolOz && <CardRow label="Pool Oz Remediated" value={ounces(oz)} />}
    </OrderCard>
  )
}
