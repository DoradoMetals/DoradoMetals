'use client'

import type { OrderTotals } from '@dorado/contracts'

import { CardHairline, CardRow, OrderCard } from './OrderCard'
import { money } from './format'

export type TotalsCardProps = {
  totals: OrderTotals | null
  totalLabel: string
}

// The order's money, as the order's own transaction row records it. Nothing
// here is summed in the browser.
export function TotalsCard({ totals, totalLabel }: TotalsCardProps) {
  const total = totals?.post_charges_amount ?? totals?.total ?? null

  return (
    <OrderCard title="Totals" summary={money(total)}>
      <CardRow label="Items" value={money(totals?.items ?? null)} />
      <CardRow label="Shipping" value={money(totals?.shipping ?? null)} />
      <CardRow label="Surcharge" value={money(totals?.surcharge ?? null)} />
      <CardRow label="Sales tax" value={money(totals?.sales_tax ?? null)} />
      {totals?.funds ? <CardRow label="Credit applied" value={money(totals.funds)} /> : null}
      <CardHairline />
      <div className="flex w-full items-center justify-between gap-md">
        <p className="text-small font-medium text-foreground">{totalLabel}</p>
        <p className="text-right text-stat-sm font-semibold text-foreground">{money(total)}</p>
      </div>
    </OrderCard>
  )
}
