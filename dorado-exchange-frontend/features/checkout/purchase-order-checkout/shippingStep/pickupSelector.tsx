'use client'

import { RadioGroup, RadioGroupItem } from '@/shared/ui/base/radio-group'
import { usePurchaseOrderCheckoutStore } from '@/store/purchaseOrderCheckoutStore'
import { pickupOptions } from '@/types/pickup'
import { cn } from '@/shared/utils/cn'

export function PickupSelector() {
  const selectedPickup = usePurchaseOrderCheckoutStore((state) => state.data.pickup)
  const setData = usePurchaseOrderCheckoutStore((state) => state.setData)

  const handleChange = (type: string) => {
    const selected = pickupOptions[type]
    if (selected) {
      setData({
        pickup: {
          ...selected,
          selectedDate: undefined,
        },
      })
    }
  }

  return (
    <div className="space-y-2">
      <RadioGroup
        value={selectedPickup?.label}
        onValueChange={handleChange}
        className="gap-3 w-full flex justify-between mt-4"
      >
        {Object.values(pickupOptions).map((pickup) => (
          <label
            key={pickup.label}
            htmlFor={pickup.label}
            className={cn(
              'raised-off-page relative peer flex flex-col items-center justify-center flex-1 gap-2 text-center rounded-lg bg-background px-1 pt-4 pb-2 cursor-pointer transition-colors has-[[data-state=checked]]:bg-card '
            )}
          >
            {pickup.icon && <pickup.icon size={24} className='text-primary' />}
            <div className="text-xs sm:text-sm text-neutral-800 font-medium">{pickup.name}</div>
            <RadioGroupItem id={pickup.label} value={pickup.label} className="sr-only" />
          </label>
        ))}
      </RadioGroup>
    </div>
  )
}
