'use client'

import { Divider } from '@dorado/components'
import type { RefiningOrderView } from '@dorado/contracts'

import { formatMoney, formatOunces } from '../_lib'
import { FigureRow } from './FigureRow'
import { RefinerCardShell, type RefinerCardContent } from './RefinerCardShell'

export type RefinerTotalsProps = {
  view: Pick<
    RefiningOrderView,
    'direction' | 'settlement_type' | 'totals' | 'expected_settlement' | 'fine_oz'
  >
  content?: Exclude<RefinerCardContent, 'empty'>
  onRetry?: () => void
}

export function RefinerTotals({ view, content = 'loaded', onRetry }: RefinerTotalsProps) {
  const sell = view.direction === 'sell'
  const pooled = sell && view.settlement_type === 'pooled'
  const { totals } = view

  return (
    <section aria-label="Totals">
      <RefinerCardShell
        label="Totals"
        content={content}
        actions={
          content === 'loaded' ? (
            <span className="text-body font-medium text-foreground tabular-nums">
              {formatMoney(totals.total)}
            </span>
          ) : undefined
        }
        emptyTitle="No totals yet"
        emptyDescription="Totals appear once the order has lots."
        errorTitle="Couldn’t load totals"
        onRetry={onRetry}
      >
        {pooled ? (
          view.fine_oz.map((metal) => (
            <FigureRow
              key={metal.metal_id}
              label={`${metal.metal_id} credited`}
              value={formatOunces(metal.pool_oz)}
            />
          ))
        ) : (
          <FigureRow label="Settlement" value={formatMoney(view.expected_settlement)} />
        )}
        <FigureRow label="Refiner fee" value={formatMoney(totals.fee)} reduces={sell} />
        <FigureRow
          label="Payment charge"
          value={formatMoney(totals.payment_charge)}
          reduces={sell}
        />
        <FigureRow label="Shipping" value={formatMoney(totals.shipping)} reduces={sell} />
        {pooled ? (
          <FigureRow
            label="Pool remediation"
            value={formatOunces(totals.pool_oz_remediated)}
            reduces
          />
        ) : (
          <FigureRow
            label="Pool remediation"
            value={formatMoney(totals.pool_remediation)}
            reduces={sell}
          />
        )}
        <Divider />
        <div className="flex items-center justify-between gap-sm">
          <span className="text-small font-medium text-foreground">Total</span>
          <span className="text-stat-sm text-foreground tabular-nums">
            {formatMoney(totals.total)}
          </span>
        </div>
      </RefinerCardShell>
    </section>
  )
}
