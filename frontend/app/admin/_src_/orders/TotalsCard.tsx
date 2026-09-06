'use client'

import type { OrderTotals, RefiningTotals } from '@dorado/contracts'

import { CardHairline, CardRow, OrderCard } from './OrderCard'
import { money } from './format'

export type TotalsCardProps = {
  totals: OrderTotals | null
  totalLabel: string
  refining?: RefiningTotals | null
}

// The order's money, as the order's own transaction row records it - or, for a
// refiner order, as `refining.order_money` defines it once. Nothing here is
// summed in the browser.
export function TotalsCard({ totals, totalLabel, refining }: TotalsCardProps) {
  const total = refining ? refining.total : (totals?.post_charges_amount ?? totals?.total ?? null)

  return (
    <OrderCard title="Totals" summary={money(total)}>
      {refining ? (
        <>
          <CardRow label="Refiner fee" value={money(refining.fee)} />
          <CardRow label="Pool remediation" value={money(refining.pool_remediation)} />
          <CardRow label="Payment charge" value={money(refining.payment_charge)} />
        </>
      ) : (
        <>
          <CardRow label="Items" value={money(totals?.items ?? null)} />
          <CardRow label="Shipping" value={money(totals?.shipping ?? null)} />
          <CardRow label="Surcharge" value={money(totals?.surcharge ?? null)} />
          <CardRow label="Sales tax" value={money(totals?.sales_tax ?? null)} />
          {totals?.funds ? <CardRow label="Credit applied" value={money(totals.funds)} /> : null}
        </>
      )}
      <CardHairline />
      <div className="flex w-full items-center justify-between gap-md">
        <p className="text-small font-medium text-foreground">{totalLabel}</p>
        <p className="text-right text-stat-sm font-semibold text-foreground">{money(total)}</p>
      </div>
    </OrderCard>
  )
}
