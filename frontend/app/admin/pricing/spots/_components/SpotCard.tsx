import NextLink from 'next/link'
import { Amount, Badge, Button, cn, Sparkline, Text, type ChartDomain } from '@dorado/components'
import type { SpotTicker } from '@dorado/contracts'

import { formatChange } from '../_lib'
import { changeTone, spotBadge } from '../_lib'

export type SpotCardProps = {
  spot: SpotTicker
  sparkline: number[]
  sparklineDomain?: ChartDomain
  footer: React.ReactNode
  href: string
}

function Side({
  label,
  value,
  dollars,
  pct,
  muted,
  align,
}: {
  label: string
  value: number | null
  dollars: number | null
  pct: number | null
  muted: boolean
  align: 'start' | 'end'
}) {
  return (
    <div className={cn('flex flex-col gap-3xs', align === 'end' && 'items-end')}>
      <Text variant="micro-medium">{label}</Text>
      {value == null ? (
        <Text variant="stat-sm">—</Text>
      ) : (
        <Amount
          tag="stat-sm"
          value={value}
          format={{ style: 'currency', currency: 'USD' }}
          className={cn(muted && 'text-muted-foreground')}
        />
      )}
      <Text variant="micro">
        <span className={muted ? undefined : changeTone(dollars)}>
          {formatChange(dollars, pct, false)}
        </span>
      </Text>
    </div>
  )
}

export function SpotCard({ spot, sparkline, sparklineDomain, footer, href }: SpotCardProps) {
  const badge = spotBadge(spot)
  const stale = spot.state === 'stale'
  return (
    <article className="flex flex-col gap-xs rounded-lg border border-border bg-card p-sm">
      <header className="flex items-center justify-between border-b border-border pb-xs">
        <Text variant="h5" as="h2">
          {spot.id}
        </Text>
        {badge && <Badge intent={badge.intent}>{badge.label}</Badge>}
      </header>
      <div className="flex flex-col gap-sm">
        <div className="flex items-center justify-between gap-xs">
          <Side
            label="Bid"
            value={spot.bid}
            dollars={spot.bid_dollar_change}
            pct={spot.bid_percent_change}
            muted={stale}
            align="start"
          />
          <Side
            label="Ask"
            value={spot.ask}
            dollars={spot.ask_dollar_change}
            pct={spot.ask_percent_change}
            muted={stale}
            align="end"
          />
        </div>
        <Sparkline
          data={sparkline}
          domain={sparklineDomain}
          label={`${spot.id} today`}
          direction={spot.direction === 'down' ? 'down' : 'up'}
          className="w-full"
        />
      </div>
      <footer className="flex items-center justify-between border-t border-border pt-xs">
        <Text variant="micro">{footer}</Text>
        <Button asChild variant="tertiary" size="sm">
          <NextLink href={href}>View</NextLink>
        </Button>
      </footer>
    </article>
  )
}
