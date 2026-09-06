'use client'

import { Badge } from '@dorado/components'
import type { RefiningOrderView } from '@dorado/contracts'

import { CardHairline, CardRow, OrderCard } from './OrderCard'
import { DASH, money, ounces } from './format'

export type SettlementCardProps = {
  order: RefiningOrderView
}

const BADGE_INTENT: Record<string, 'warning' | 'success' | 'danger' | 'neutral'> = {
  'Pending assay': 'warning',
  Settled: 'success',
  Disputed: 'danger',
  Cancelled: 'neutral',
}

// The refiner sales order's replacement for Profit Breakdown: what we estimated
// against what the refinery assayed. `state` is a label the view computes;
// Settled fine oz and Variance fill in when the settlement lands.
export function SettlementCard({ order }: SettlementCardProps) {
  const intent = BADGE_INTENT[order.state] ?? 'warning'

  return (
    <OrderCard
      title="Settlement"
      summary={ounces(order.settled_content ?? order.estimated_content)}
      right={
        <Badge intent={intent} variant="soft">
          {order.state}
        </Badge>
      }
    >
      <CardRow label="Estimated fine oz" value={ounces(order.estimated_content)} />
      <CardRow label="Settled fine oz" value={ounces(order.settled_content)} />
      <CardRow label="Variance" value={ounces(order.variance)} />
      <CardRow label="Assay lab" value={order.assay_lab ?? DASH} />
      <CardHairline />
      <div className="flex w-full items-center justify-between gap-md">
        <p className="text-small font-medium text-foreground">Expected settlement</p>
        <p className="text-right text-stat-sm font-semibold text-foreground">
          {money(order.expected_settlement)}
        </p>
      </div>
    </OrderCard>
  )
}
