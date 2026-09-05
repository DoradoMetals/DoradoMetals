'use client'

import type { CarrierHandoff } from '@dorado/contracts'

import { RadioGroup, RadioOption } from '@dorado/components'
import { useCreateFulfillment } from '@/shared/hooks/checkout/queries'
import { handoffIcon } from '@/shared/types/handoff'

// HOW THE PARCEL REACHES THE CARRIER - the customer drops it off, or the
// carrier collects it. NOT a Dorado pickup; see features/handoff/types.ts for
// the two things that share the word.
//
// Presentational: the options are a prop and the SELECTION is `selected`,
// resolved by the caller (gates.ts `resolveHandoff`) from the DRAFT
// FULFILLMENT's own method type. Nothing local remembers which one was picked,
// so a second device shows the same choice.
//
// Picking one is POST /api/fulfillments (rulings 69/70) - idempotent
// server-side, so a second click moves the draft's method rather than minting a
// second draft.
export function PickupSelector({
  handoffs,
  selected,
  checkout_id,
}: {
  handoffs: CarrierHandoff[]
  selected: string | null
  checkout_id?: string
}) {
  const createFulfillment = useCreateFulfillment()

  return (
    <RadioGroup
      value={selected ?? ''}
      onValueChange={(handoff_code) => {
        if (checkout_id) createFulfillment.mutate({ checkout_id, handoff_code })
      }}
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
