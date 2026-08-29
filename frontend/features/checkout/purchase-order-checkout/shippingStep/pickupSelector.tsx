'use client'

import { RadioGroup } from '@/shared/ui/RadioGroup'
import { usePurchaseOrderCheckoutStore } from '@/shared/store/purchaseOrderCheckoutStore'
import { pickupOptions } from '@/features/handoff/types'

export function PickupSelector() {
  const selectedPickup = usePurchaseOrderCheckoutStore((state) => state.data.pickup)
  const setData = usePurchaseOrderCheckoutStore((state) => state.setData)

  return (
    <RadioGroup
      value={selectedPickup?.label}
      onValueChange={(type) =>
        setData({ pickup: { ...pickupOptions[type], selectedDate: undefined } })
      }
      options={pickupOptions}
      getValue={(pickup) => pickup.label}
      variant="tile"
      className="mt-4 flex w-full items-stretch justify-between gap-3"
      optionClassName="flex-1"
    >
      {(pickup) => (
        <>
          {pickup.icon && <pickup.icon size={24} />}
          <strong>{pickup.name}</strong>
        </>
      )}
    </RadioGroup>
  )
}
