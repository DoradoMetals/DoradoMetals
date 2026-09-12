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
