'use client'

import * as React from 'react'
import { Amount, Divider, Text, cn } from '@dorado/components'
import type { Direction, OrderPricing } from '@dorado/contracts'

import { formatTotal } from '../../_lib'
import { OrderSection, type SectionContent } from './OrderSection'

export type TotalsPricing = OrderPricing & { credit_released?: number | null }

export type TotalsProps = {
  direction: Direction
  pricing: TotalsPricing | null | undefined
  content?: Exclude<SectionContent, 'empty'>
  layout?: 'desktop' | 'mobile'
  onRetry?: () => void
  defaultOpen?: boolean
}

type Line = { label: string; value: string; deduction?: boolean }

const minus = (value: number) => `−${formatTotal(value)}`

function linesFor(direction: Direction, pricing: TotalsPricing): Line[] {
  if (direction === 'purchase') {
    return [
      { label: 'Scrap', value: formatTotal(pricing.scrap_total) },
      { label: 'Bullion', value: formatTotal(pricing.bullion_total) },
      { label: 'Shipping', value: formatTotal(pricing.shipping_charge), deduction: true },
      { label: 'Payout fee', value: formatTotal(pricing.payout_fee), deduction: true },
    ]
  }
  const lines: Line[] = [
    { label: 'Items', value: formatTotal(pricing.items_total) },
    { label: 'Shipping', value: formatTotal(pricing.shipping_charge) },
    { label: 'Sales tax', value: formatTotal(pricing.sales_tax) },
  ]
  if (pricing.credit_applied > 0) {
    lines.push({ label: 'Credit applied', value: minus(pricing.credit_applied), deduction: true })
  }
  if (pricing.credit_released != null && pricing.credit_released > 0) {
    lines.push({ label: 'Credit released to balance', value: formatTotal(pricing.credit_released) })
  }
  return lines
}

export function Totals({
  direction,
  pricing,
  content = 'loaded',
  layout = 'desktop',
  onRetry,
  defaultOpen = true,
}: TotalsProps) {
  const state: SectionContent = content === 'loaded' && pricing == null ? 'empty' : content
  const totalLabel = direction === 'purchase' ? 'Total payout' : 'Total due'

  return (
    <OrderSection
      title="Totals"
      layout={layout}
      content={state}
      summary={pricing ? formatTotal(pricing.total) : undefined}
      emptyTitle="Not priced yet"
      emptyDescription="Totals appear once the lots on this order are priced."
      errorTitle="Couldn’t load totals"
      onRetry={onRetry}
      defaultOpen={defaultOpen}
    >
      {pricing && (
        <>
          {linesFor(direction, pricing).map((line) => (
            <div key={line.label} className="flex items-center justify-between gap-xs">
              <Text variant="small" className="text-muted-foreground">
                {line.label}
              </Text>
              <Text
                variant="small-medium"
                className={cn(line.deduction ? 'text-destructive' : 'text-foreground')}
              >
                {line.value}
              </Text>
            </div>
          ))}
          <Divider />
          <div className="flex items-center justify-between gap-xs">
            <Text variant="small-medium">{totalLabel}</Text>
            <Amount value={pricing.total} tag="stat-sm" />
          </div>
        </>
      )}
    </OrderSection>
  )
}
