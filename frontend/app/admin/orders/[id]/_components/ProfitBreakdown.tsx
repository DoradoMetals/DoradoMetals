'use client'

import * as React from 'react'
import { Amount, Divider, Link, Text } from '@dorado/components'
import type { ProfitBreakdown as ProfitBreakdownView, ProfitLot } from '@dorado/contracts'

import { formatTotal } from '../../_lib'
import { OrderSection, type SectionContent } from './OrderSection'

export type ProfitBreakdownProps = {
  breakdown: ProfitBreakdownView | null | undefined
  content?: Exclude<SectionContent, 'empty'>
  layout?: 'desktop' | 'mobile'
  lotHref?: (lotId: string) => string
  onRetry?: () => void
  defaultOpen?: boolean
}

function Row({ label, value }: { label: React.ReactNode; value: string }) {
  return (
    <div className="flex items-center justify-between gap-xs">
      {label}
      <Text variant="small-medium" className="text-foreground">
        {value}
      </Text>
    </div>
  )
}

export function ProfitBreakdown({
  breakdown,
  content = 'loaded',
  layout = 'desktop',
  lotHref,
  onRetry,
  defaultOpen = true,
}: ProfitBreakdownProps) {
  const lots = breakdown?.lots ?? []
  const state: SectionContent =
    content === 'loaded' && (breakdown == null || lots.length === 0) ? 'empty' : content
  const settledCount = breakdown
    ? `${breakdown.settled_lots} of ${breakdown.total_lots} settled`
    : null
  const realized = breakdown?.basis === 'realized'
  const unsettled = lots.filter((lot) => lot.settled_at == null)
  const settled = lots.filter((lot) => lot.settled_at != null)

  const lotRow = (lot: ProfitLot) => (
    <Row
      key={lot.lot_id}
      value={formatTotal(lot.value)}
      label={
        lotHref ? (
          <Link href={lotHref(lot.lot_id)}>{lot.reference}</Link>
        ) : (
          <Text variant="small-medium">{lot.reference}</Text>
        )
      }
    />
  )

  const group = (title: string, rows: ProfitLot[]) =>
    rows.length > 0 && (
      <>
        <Text variant="eyebrow" className="text-muted-foreground">
          {title}
        </Text>
        {rows.map((lot) => lotRow(lot))}
      </>
    )

  const fee = (label: string, value: number) => (
    <Row
      key={label}
      value={formatTotal(value)}
      label={
        <Text variant="small" className="text-subtle">
          {label}
        </Text>
      }
    />
  )

  const qualifier = (text: string | null) =>
    text == null ? undefined : (
      <Text variant="small" className="text-muted-foreground">
        {text}
      </Text>
    )

  return (
    <OrderSection
      title="Profit Breakdown"
      layout={layout}
      content={state}
      bodyGap="xs-plus"
      badge={qualifier(settledCount)}
      closedBadge={qualifier(realized ? 'Realized' : settledCount)}
      summary={breakdown ? formatTotal(breakdown.profit) : undefined}
      emptyTitle="No profit yet"
      emptyDescription="Profit shows once a lot on this order settles or sells."
      errorTitle="Couldn’t load profit"
      onRetry={onRetry}
      defaultOpen={defaultOpen}
    >
      {breakdown && (
        <>
          {group('Unsettled', unsettled)}
          {group('Settled', settled)}
          <Text variant="eyebrow" className="text-muted-foreground">
            Fees
          </Text>
          {fee('Shipping', breakdown.fees.shipping)}
          {fee('Payout fee', breakdown.fees.payout_fee)}
          <Divider />
          <div className="flex items-center justify-between gap-xs">
            <Text variant="small-medium">Profit</Text>
            <Amount value={breakdown.profit} tag="stat-sm" />
          </div>
        </>
      )}
    </OrderSection>
  )
}
