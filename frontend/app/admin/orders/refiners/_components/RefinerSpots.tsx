'use client'

import type { RefiningSpot } from '@dorado/contracts'

import { formatMoney } from '../_lib'
import { FigureField } from './FigureRow'
import { RefinerCardShell, type RefinerCardContent } from './RefinerCardShell'

export type RefinerSpotsProps = {
  spots: RefiningSpot[]
  content?: RefinerCardContent
  onRetry?: () => void
}

export function RefinerSpots({ spots, content = 'loaded', onRetry }: RefinerSpotsProps) {
  const shown: RefinerCardContent = content === 'loaded' && spots.length === 0 ? 'empty' : content
  return (
    <section aria-label="Spots">
      <RefinerCardShell
        label="Spots"
        content={shown}
        emptyTitle="No spots yet"
        emptyDescription="Each lot takes its spot when the refiner settles it."
        errorTitle="Couldn’t load spots"
        onRetry={onRetry}
      >
        <div className="grid grid-cols-1 gap-md sm:grid-cols-3">
          {spots.map((spot) => (
            <FigureField key={spot.metal_id} label={spot.metal_id} value={formatMoney(spot.spot)} />
          ))}
        </div>
      </RefinerCardShell>
    </section>
  )
}
