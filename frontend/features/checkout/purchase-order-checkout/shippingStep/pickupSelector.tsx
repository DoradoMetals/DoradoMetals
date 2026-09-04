'use client'

import type { CarrierHandoff, CheckoutView } from '@dorado/contracts'

import { RadioGroup, RadioOption } from '@dorado/components'
import { useSetCheckoutFulfillment } from '@/features/checkout/queries'
import { handoffIcon } from '@/features/handoff/types'

// HOW THE PARCEL REACHES THE CARRIER - the customer drops it off, or the
// carrier collects it. NOT a Dorado pickup; see features/handoff/types.ts for
// the two things that share the word.
//
// Presentational: the options are a prop and the SELECTION is the row's own
// `handoff_code`, which the server resolves back from the draft fulfillment's
// method. Nothing local remembers which one was picked, so a second device
// shows the same choice.
export function PickupSelector({
  handoffs,
  row,
}: {
  handoffs: CarrierHandoff[]
  row?: CheckoutView
}) {
  const setFulfillment = useSetCheckoutFulfillment('purchase')

  return (
    <RadioGroup
      value={row?.handoff_code ?? ''}
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
