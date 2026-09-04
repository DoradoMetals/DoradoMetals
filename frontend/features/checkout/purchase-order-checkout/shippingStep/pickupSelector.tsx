'use client'

import type { CarrierHandoff } from '@dorado/contracts'

import { RadioGroup, RadioOption } from '@dorado/components'
import { useSetCheckoutFulfillment } from '@/features/checkout/queries'
import { handoffIcon } from '@/features/handoff/types'

// HOW THE PARCEL REACHES THE CARRIER - the customer drops it off, or the
// carrier collects it. NOT a Dorado pickup; see features/handoff/types.ts for
// the two things that share the word.
//
// Presentational: the options are a prop and the SELECTION is `selected`,
// resolved by the caller (gates.ts `resolveHandoff`) from the row's own
// `fulfillment_method_id` - the row carries no `handoff_code` any more
// (2026-09-04 shrink). Nothing local remembers which one was picked, so a
// second device shows the same choice.
export function PickupSelector({
  handoffs,
  selected,
}: {
  handoffs: CarrierHandoff[]
  selected: string | null
}) {
  const setFulfillment = useSetCheckoutFulfillment('purchase')

  return (
    <RadioGroup
      value={selected ?? ''}
      onValueChange={(handoff_code) => setFulfillment.mutate({ handoff_code })}
      className="mt-4 flex w-full items-stretch justify-between gap-3"
    >
      {handoffs.map((handoff) => {
        const Icon = handoffIcon(handoff)
        return (
          <RadioOption key={handoff.code} value={handoff.code} variant="tile" className="flex-1">
            <Icon size={24} />
            <strong>{handoff.name}</strong>
          </RadioOption>
        )
      })}
    </RadioGroup>
  )
}
