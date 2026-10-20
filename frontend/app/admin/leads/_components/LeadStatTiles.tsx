'use client'

import * as React from 'react'
import { Badge, Card, Progress, Skeleton, Sparkline, Text, cn } from '@dorado/components'
import type { LeadSummary } from '@dorado/contracts'

import {
  DASH,
  formatCountDelta,
  formatHours,
  formatMinutesDelta,
  formatPoints,
  formatRate,
} from '../_lib'

type Tone = 'success' | 'danger'

function Tile({
  label,
  value,
  delta,
  tone,
  note,
  children,
}: {
  label: string
  value: React.ReactNode
  delta?: string | null
  tone?: Tone
  note?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <Card className="gap-md p-md">
      <div className="flex items-center justify-between gap-xs">
        <Text variant="small" className="text-muted-foreground">
          {label}
        </Text>
        {delta != null && (
          <Badge variant="soft" intent={tone ?? 'success'}>
            {delta}
          </Badge>
        )}
      </div>
      <div className="flex flex-col gap-xs">
        <Text variant="h2">{value}</Text>
        {note != null && (
          <Text variant="micro" className="text-muted-foreground">
            {note}
          </Text>
        )}
      </div>
      {children}
    </Card>
  )
}

function Bar({ label, value, shown }: { label: string; value: number; shown: string }) {
  return (
    <div className="flex items-center gap-sm">
      <Text variant="micro" className="w-24 shrink-0 text-muted-foreground">
        {label}
      </Text>
      <Progress value={value} aria-label={label} className="flex-1" />
      <Text variant="micro" className="w-10 shrink-0 text-right text-muted-foreground">
        {shown}
      </Text>
    </div>
  )
}

const Trend = React.memo(function Trend({ data }: { data: number[] }) {
  return <Sparkline data={data} label="Weekly conversion rate" className="h-12 w-full" />
})

const toneOf = (delta: number | null | undefined, higherIsBetter: boolean): Tone =>
  delta == null || delta === 0 || delta > 0 === higherIsBetter ? 'success' : 'danger'

export type LeadStatTilesProps = {
  summary: LeadSummary | undefined
  className?: string
}

export function LeadStatTiles({ summary, className }: LeadStatTilesProps) {
  const history = summary?.conversion.history
  const trend = React.useMemo(() => (history ?? []).map((week) => week.rate), [history])
  if (!summary) {
    return (
      <div
        data-testid="lead-stat-tiles"
        role="status"
        aria-label="Loading lead stats"
        className={cn('grid grid-cols-1 gap-md lg:grid-cols-2', className)}
      >
        {[0, 1, 2, 3].map((tile) => (
          <Skeleton key={tile} className="h-40 w-full" />
        ))}
      </div>
    )
  }

  const { deltas, response_rate_by_channel: channels, conversion, first_contact } = summary
  const attention = summary.needs_attention
  const count = summary.totals.count
  const target = first_contact.target_hours
  const median = first_contact.median_hours
  const over = median != null && target != null ? median - target : null

  return (
    <div
      data-testid="lead-stat-tiles"
      className={cn('grid grid-cols-1 gap-md lg:grid-cols-2', className)}
    >
      <Tile
        label="Response rate"
        value={formatRate(summary.response_rate)}
        delta={deltas.response_rate_pts == null ? null : formatPoints(deltas.response_rate_pts)}
        tone={toneOf(deltas.response_rate_pts, true)}
      >
        <div className="flex flex-col gap-xs">
          <Bar label="Text" value={channels.text * 100} shown={formatRate(channels.text)} />
          <Bar label="Call" value={channels.call * 100} shown={formatRate(channels.call)} />
          <Bar label="Email" value={channels.email * 100} shown={formatRate(channels.email)} />
        </div>
      </Tile>
      <Tile
        label="Conversion rate"
        value={formatRate(conversion.rate)}
        delta={deltas.conversion_rate_pts == null ? null : formatPoints(deltas.conversion_rate_pts)}
        tone={toneOf(deltas.conversion_rate_pts, true)}
        note={conversion.target == null ? undefined : `target ${formatRate(conversion.target)}`}
      >
        {trend.length > 1 && <Trend data={trend} />}
      </Tile>
      <Tile
        label="Median time to first contact"
        value={formatHours(median)}
        delta={
          deltas.median_first_contact_minutes == null
            ? null
            : formatMinutesDelta(deltas.median_first_contact_minutes)
        }
        tone={toneOf(deltas.median_first_contact_minutes, false)}
        note={
          target == null
            ? undefined
            : over != null && over > 0
              ? `target ${formatHours(target)} · ${formatHours(over)} over`
              : `target ${formatHours(target)}`
        }
      >
        {median != null && target != null && (
          <Progress
            value={Math.min(100, (median / (target * 2)) * 100)}
            aria-label="Median against target"
          />
        )}
      </Tile>
      <Tile
        label="Needs attention"
        value={count === 0 ? DASH : `${attention.total} of ${count}`}
        delta={deltas.needs_attention == null ? null : formatCountDelta(deltas.needs_attention)}
        tone={toneOf(deltas.needs_attention, false)}
        note={`${attention.both} of them are both`}
      >
        <div className="flex flex-col gap-xs">
          <Bar
            label="Unassigned"
            value={count === 0 ? 0 : (attention.unassigned / count) * 100}
            shown={String(attention.unassigned)}
          />
          <Bar
            label="Not contacted"
            value={count === 0 ? 0 : (attention.not_contacted / count) * 100}
            shown={String(attention.not_contacted)}
          />
        </div>
      </Tile>
    </div>
  )
}
