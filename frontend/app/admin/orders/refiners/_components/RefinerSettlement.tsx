'use client'

import * as React from 'react'
import { Alert, Badge, Button, Chip, Divider, cn, type BadgeProps } from '@dorado/components'
import type {
  RefiningFineOz,
  RefiningOrderRead,
  RefiningPricing,
  RefiningSettlementState,
  SettlementType,
} from '@dorado/contracts'

import { formatTotal, pluralize } from '../../_lib'
import { RefinerCardShell, type RefinerCardContent } from './RefinerCardShell'

export type RefinerSettlementProps = {
  order?: RefiningOrderRead
  pricing?: RefiningPricing
  content?: RefinerCardContent
  layout?: 'desktop' | 'mobile'
  pending?: boolean
  onRecordSettlement: () => void
  onResolveDispute: () => void
  onSettlementTypeChange: (type: SettlementType) => void
  onRetry?: () => void
  className?: string
}

type Look = Pick<NonNullable<BadgeProps>, 'intent'>

const looks: Record<RefiningSettlementState, Look> = {
  Pending: { intent: 'warning' },
  Partial: { intent: 'info' },
  Settled: { intent: 'success' },
  Disputed: { intent: 'danger' },
  Cancelled: { intent: 'danger' },
}

const fineOz = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
})

const ounces = (oz: number, metal: string): string =>
  `${fineOz.format(oz)} oz ${metal.toLowerCase()}`

function badgeLabel(order: RefiningOrderRead): string {
  const { state, settled_lots, lot_count } = order.settlement
  if (state === 'Pending') return 'Pending Assay'
  if (state === 'Partial') return `${settled_lots} of ${lot_count} settled`
  return state
}

function Fact({ label, values, quiet }: { label: string; values: string[]; quiet?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-sm">
      <span className="text-small text-muted-foreground">{label}</span>
      <span
        className={cn(
          'flex flex-col items-end text-small font-medium',
          quiet ? 'text-muted-foreground' : 'text-foreground'
        )}
      >
        {values.map((value) => (
          <span key={value}>{value}</span>
        ))}
      </span>
    </div>
  )
}

function perMetal(
  rows: RefiningFineOz[],
  pick: (row: RefiningFineOz) => number | null
): string[] | null {
  const shown = rows.filter((row) => pick(row) !== null)
  if (shown.length === 0) return null
  return shown.map((row) => ounces(pick(row) as number, row.metal_id))
}

export function RefinerSettlement({
  order,
  pricing,
  content = 'loaded',
  layout = 'desktop',
  pending = false,
  onRecordSettlement,
  onResolveDispute,
  onSettlementTypeChange,
  onRetry,
  className,
}: RefinerSettlementProps) {
  const shown: RefinerCardContent = content === 'loaded' && !order ? 'loading' : content
  const offered = new Set(order?.actions.map((action) => action.name) ?? [])
  const state = order?.settlement.state ?? 'Pending'
  const cancelled = state === 'Cancelled'
  const pooled = order?.settlement_type === 'pooled'
  const locked = cancelled || order?.settled_at != null || (order?.settlement.settled_lots ?? 0) > 0
  const rows = order?.fine_oz ?? []
  const left = order ? order.settlement.lot_count - order.settlement.settled_lots : 0
  const returned = order?.lots.some((lot) => lot.returned_at != null) ?? false

  const actions = order ? (
    <span className="flex items-center gap-xs">
      <Badge intent={looks[state].intent} variant="soft">
        {badgeLabel(order)}
      </Badge>
      {offered.has('resolve_dispute') ? (
        <Button variant="primary" size="sm" disabled={pending} onClick={onResolveDispute}>
          Resolve dispute
        </Button>
      ) : offered.has('settle') ? (
        <Button variant="primary" size="sm" disabled={pending} onClick={onRecordSettlement}>
          Record settlement
        </Button>
      ) : null}
    </span>
  ) : undefined

  const awaiting = cancelled || state === 'Pending' || state === 'Disputed'
  const settled = awaiting ? null : perMetal(rows, (row) => row.settled_content)
  const variance = awaiting
    ? null
    : state === 'Partial'
      ? [`Pending on ${pluralize(left, 'lot', 'lots')}`]
      : perMetal(rows, (row) => row.variance)
  const blank = cancelled ? '—' : 'Pending'

  const money = (value: number | null | undefined) =>
    cancelled || value == null ? '—' : formatTotal(value)

  return (
    <section
      data-layout={layout}
      data-state={state}
      data-type={pooled ? 'pooled' : 'paid'}
      aria-label="Settlement"
      className={className}
    >
      <RefinerCardShell
        label="Settlement"
        content={shown}
        actions={actions}
        emptyTitle="No settlement yet"
        emptyDescription="The refiner’s settlement shows here when it arrives."
        errorTitle="Couldn’t load settlement"
        onRetry={onRetry}
      >
        {order ? (
          <>
            <div className="flex flex-col gap-2xs-plus">
              <span className="text-small text-muted-foreground">Settlement</span>
              <div role="group" aria-label="Settlement type" className="flex gap-xs">
                <Chip
                  label="Paid at settlement"
                  selected={!pooled}
                  disabled={locked || pending}
                  onClick={() => pooled && onSettlementTypeChange('paid')}
                />
                <Chip
                  label="Pooled"
                  selected={pooled}
                  disabled={locked || pending}
                  onClick={() => !pooled && onSettlementTypeChange('pooled')}
                />
              </div>
            </div>
            <Divider />
            {state === 'Disputed' ? (
              <Alert intent="danger" title="Assay disputed">
                {order.dispute_note ?? undefined}
              </Alert>
            ) : null}
            {cancelled ? (
              <Alert intent="neutral" title="Batch cancelled">
                {returned
                  ? `${order.number} was cancelled after the metal reached the refiner. Its ${pluralize(order.lots.length, 'lot is', 'lots are')} coming back.`
                  : `${order.number} was cancelled before it shipped. Its ${pluralize(order.lots.length, 'lot is', 'lots are')} back on hand.`}
              </Alert>
            ) : null}
            <Fact
              label="Estimated fine oz"
              values={perMetal(rows, (row) => row.estimated_content) ?? ['—']}
            />
            <Fact label="Settled fine oz" values={settled ?? [blank]} quiet={settled === null} />
            <Fact
              label="Variance"
              values={variance ?? [blank]}
              quiet={variance === null || state === 'Partial'}
            />
            <Fact label="Assay lab" values={[order.assay_lab ?? '—']} />
            <Divider />
            {pooled ? (
              <div className="flex items-center justify-between gap-sm">
                <span className="text-small font-medium text-foreground">Credited to pool</span>
                <span className="stat-sm flex flex-col items-end text-foreground">
                  {(cancelled ? null : perMetal(rows, (row) => row.pool_oz))?.map((value) => (
                    <span key={value}>{value}</span>
                  )) ?? '—'}
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-sm">
                <span className="text-small font-medium text-foreground">
                  {state === 'Partial'
                    ? `Settled of ${money(pricing?.expected_settlement)}`
                    : 'Expected settlement'}
                </span>
                <span className="stat-sm text-foreground">
                  {state === 'Partial'
                    ? money(pricing?.settled_amount)
                    : money(pricing?.expected_settlement)}
                </span>
              </div>
            )}
          </>
        ) : null}
      </RefinerCardShell>
    </section>
  )
}
