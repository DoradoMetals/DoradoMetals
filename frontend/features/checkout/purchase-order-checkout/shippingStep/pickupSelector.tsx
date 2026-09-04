'use client'

import type { CarrierHandoff } from "@dorado/contracts";
import { format } from 'date-fns'

import { RadioGroup } from '@/shared/ui/RadioGroup'
import { usePurchaseOrderCheckoutStore } from '@/shared/store/purchaseOrderCheckoutStore'
import { useSetPurchaseHandoff } from '@/features/checkout/queries'
import { handoffIcon } from '@/features/handoff/types'

// HOW THE PARCEL REACHES THE CARRIER - the customer drops it off, or the
// carrier collects it. NOT a Dorado pickup; see features/handoff/types.ts for
// the two things that share the word.
//
// Presentational, per ruling 14: the options are a prop, the parent holds the
// read. This component used to import `pickupOptions` and render a record keyed
// by DROPOFF_AT_FEDEX_LOCATION - so it knew a carrier's enum, which is exactly
// what the wire conversion took out of every other feature.
export function PickupSelector({ handoffs }: { handoffs: CarrierHandoff[] }) {
  const selectedPickup = usePurchaseOrderCheckoutStore((state) => state.data.pickup)
  const setData = usePurchaseOrderCheckoutStore((state) => state.setData)
  const setHandoff = useSetPurchaseHandoff()

  const handleSelect = (code: string) => {
    const handoff = handoffs.find((h) => h.code === code)
    if (!handoff) return

    setData({
      pickup: {
        // `label` is the carrier's code, received and handed back untouched.
        label: handoff.code,
        // `name` is what lands in shipments.pickup_type, which is why it comes
        // from the server rather than being composed here.
        name: handoff.name,
        // Was baked into the constant at MODULE LOAD, so a tab left open across
        // midnight offered yesterday. Read at selection instead - same shape,
        // and the scheduler overwrites it with a date the carrier confirms.
        date: format(new Date(), 'yyyy-MM-dd'),
        time: '',
        selectedDate: undefined,
      },
    })
    // D208: the draft fulfillment takes the handoff the moment it's picked.
    setHandoff.mutate(handoff.code)
  }

  return (
    <RadioGroup
      value={selectedPickup?.label}
      onValueChange={handleSelect}
      options={handoffs}
      getValue={(handoff) => handoff.code}
      variant="tile"
      className="mt-4 flex w-full items-stretch justify-between gap-3"
      optionClassName="flex-1"
    >
      {(handoff) => {
        const Icon = handoffIcon(handoff)
        return (
          <>
            <Icon size={24} />
            <strong>{handoff.name}</strong>
          </>
        )
      }}
    </RadioGroup>
  )
}
