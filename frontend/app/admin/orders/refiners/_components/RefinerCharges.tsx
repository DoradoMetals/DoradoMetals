'use client'

import type { RefiningOrderView } from '@dorado/contracts'

import { formatMoney, formatOunces } from '../_lib'
import { FigureField } from './FigureRow'
import { RefinerCardShell, type RefinerCardContent } from './RefinerCardShell'

export type RefinerChargesProps = {
  view: Pick<RefiningOrderView, 'direction' | 'totals'>
  content?: Exclude<RefinerCardContent, 'empty'>
  onRetry?: () => void
}

export function RefinerCharges({ view, content = 'loaded', onRetry }: RefinerChargesProps) {
  return (
    <section aria-label="Charges">
      <RefinerCardShell
        label="Charges"
        content={content}
        emptyTitle="No charges"
        emptyDescription="Charges appear once the order is sent."
        errorTitle="Couldn’t load charges"
        onRetry={onRetry}
      >
        <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
          <FigureField label="Payment Charge" value={formatMoney(view.totals.payment_charge)} />
          {view.direction === 'sell' ? (
            <FigureField
              label="Pool Oz Remediated"
              value={formatOunces(view.totals.pool_oz_remediated)}
            />
          ) : (
            <FigureField label="Shipping Charge" value={formatMoney(view.totals.shipping)} />
          )}
        </div>
      </RefinerCardShell>
    </section>
  )
}
