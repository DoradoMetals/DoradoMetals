'use client'

import * as React from 'react'
import { Button, Input } from '@dorado/components'
import { Lock, LockOpen } from '@dorado/icons'
import type { OrderSpot, SpotPrice } from '@dorado/contracts'

import { OrderCard } from './OrderCard'
import { money } from './format'

export type SpotsCardProps = {
  spots: Pick<OrderSpot, 'metal_id' | 'bid'>[]
  live: SpotPrice[]
  locked: boolean
  canToggle: boolean
  toggleDisabled?: boolean
  onToggleLock: (lock: boolean) => void
  onSetBid: (metal_id: string, bid: number) => void
  pending?: boolean
}

export function SpotsCard({
  spots,
  live,
  locked,
  canToggle,
  toggleDisabled = false,
  onToggleLock,
  onSetBid,
  pending = false,
}: SpotsCardProps) {
  const liveByMetal = new Map(live.map((row) => [row.id, row]))
  const shown = spots.map((spot) => ({
    metal_id: spot.metal_id,
    bid: locked ? spot.bid : (liveByMetal.get(spot.metal_id)?.bid ?? spot.bid),
  }))
  const first = shown[0]

  return (
    <OrderCard
      title="Spots"
      summary={first ? `${first.metal_id} ${money(first.bid)}` : undefined}
      right={
        canToggle ? (
          <Button
            variant="secondary"
            size="icon"
            aria-label={locked ? 'Unlock Spots' : 'Lock Spots'}
            title={locked ? 'Unlock Spots' : 'Lock Spots'}
            disabled={toggleDisabled || pending}
            onClick={() => onToggleLock(!locked)}
            icon={locked ? LockOpen : Lock}
          />
        ) : undefined
      }
    >
      <div className="flex w-full items-start gap-md">
        {shown.map((spot) => (
          <SpotField
            key={spot.metal_id}
            metal={spot.metal_id}
            bid={spot.bid}
            readOnly={!locked}
            onCommit={(value) => onSetBid(spot.metal_id, value)}
          />
        ))}
      </div>
    </OrderCard>
  )
}

function SpotField({
  metal,
  bid,
  readOnly,
  onCommit,
}: {
  metal: string
  bid: number | null
  readOnly: boolean
  onCommit: (value: number) => void
}) {
  const asText = bid === null ? '' : String(bid)
  const [draft, setDraft] = React.useState(asText)
  React.useEffect(() => setDraft(asText), [asText])

  return (
    <Input
      label={metal}
      type="number"
      inputMode="decimal"
      value={draft}
      readOnly={readOnly}
      trailing={<span className="text-small text-muted-foreground">$</span>}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (readOnly) return
        const next = Number(draft)
        if (!Number.isFinite(next) || next === bid) return
        onCommit(next)
      }}
      className="flex-1"
    />
  )
}
