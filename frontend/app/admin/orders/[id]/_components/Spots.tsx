'use client'

import * as React from 'react'
import { Button, cn } from '@dorado/components'
import { Lock, LockOpen } from '@dorado/icons'
import type { Direction, OrderPricingSpot } from '@dorado/contracts'

import { ORDER_ACTIONS, formatDecimal, offers, type OrderAction } from '../_lib'
import { DecimalField } from './DecimalField'
import { OrderSection, type SectionContent } from './OrderSection'

export type SpotsProps = {
  direction: Direction
  spots: readonly OrderPricingSpot[] | undefined
  locked: boolean
  actions: readonly OrderAction[]
  content?: Exclude<SectionContent, 'empty'>
  layout?: 'desktop' | 'mobile'
  onLock?: () => void
  onUnlock?: () => void
  onSpotChange?: (metalId: string, value: number | null) => void
  onRetry?: () => void
  defaultOpen?: boolean
}

export function Spots({
  direction,
  spots,
  locked,
  actions,
  content = 'loaded',
  layout = 'desktop',
  onLock,
  onUnlock,
  onSpotChange,
  onRetry,
  defaultOpen = true,
}: SpotsProps) {
  const rows = spots ?? []
  const state: SectionContent = content === 'loaded' && rows.length === 0 ? 'empty' : content
  const lockName = locked ? ORDER_ACTIONS.unlockSpots : ORDER_ACTIONS.lockSpots
  const canToggle = offers(actions, lockName) && (locked ? onUnlock : onLock) != null
  const editable = locked && offers(actions, ORDER_ACTIONS.editSpots) && onSpotChange != null

  return (
    <OrderSection
      title="Spots"
      layout={layout}
      content={state}
      summary={locked ? 'Locked' : 'Unlocked'}
      actions={
        state === 'loaded' ? (
          <Button
            variant="secondary"
            size="iconSm"
            aria-label={locked ? 'Unlock spots' : 'Lock spots'}
            disabled={!canToggle}
            onClick={locked ? onUnlock : onLock}
          >
            {locked ? <LockOpen aria-hidden /> : <Lock aria-hidden />}
          </Button>
        ) : undefined
      }
      emptyTitle="No spot prices yet"
      emptyDescription="The live spot for each metal on this order shows here."
      errorTitle="Couldn’t load spots"
      onRetry={onRetry}
      defaultOpen={defaultOpen}
    >
      <div
        data-locked={locked || undefined}
        className={cn('grid gap-md', layout === 'mobile' ? 'grid-cols-2' : 'grid-cols-4')}
      >
        {rows.map((spot) => (
          <DecimalField
            key={spot.metal_id}
            label={spot.metal_id}
            value={direction === 'sale' ? spot.ask : spot.bid}
            format={formatDecimal}
            unit="$"
            readOnly={!editable}
            onCommit={editable ? (value) => onSpotChange?.(spot.metal_id, value) : undefined}
          />
        ))}
      </div>
    </OrderSection>
  )
}
