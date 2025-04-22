'use client'

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { usePurchaseOrderCheckoutStore } from '@/store/purchaseOrderCheckoutStore'
import { pickupOptions } from '@/types/pickup'
import { cn } from '@/lib/utils'

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
      <h2 className="text-xs text-neutral-600 tracking-widest mb-4">Carrier Pickup or Dropoff</h2>
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
              'relative peer flex flex-col items-center justify-center flex-1 gap-2 text-center rounded-lg border border-border bg-background px-1 pt-4 pb-2 cursor-pointer transition-colors has-[[data-state=checked]]:bg-card has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:shadow-md'
            )}
          >
            {pickup.icon && <pickup.icon className="w-5 h-5 text-primary" />}
            <div className="text-xs sm:text-sm text-neutral-800 font-medium">{pickup.name}</div>
            <RadioGroupItem id={pickup.label} value={pickup.label} className="sr-only" />
          </label>
        ))}
      </RadioGroup>
    </div>
  )
}
