'use client'

import { useMemo } from 'react'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import PriceNumberFlow from '../../products/PriceNumberFlow'
import getPrimaryIconStroke, { getCustomPrimaryIconStroke } from '@/utils/getPrimaryIconStroke'
import { useSalesOrderCheckoutStore } from '@/store/salesOrderCheckoutStore'
import { salesOrderServiceOptions } from '@/types/sales-orders'
import { cartStore } from '@/store/cartStore'
import getProductPrice from '@/utils/getProductPrice'
import { useSpotPrices } from '@/lib/queries/useSpotPrices'

export default function ServiceSelector() {
  const selected = useSalesOrderCheckoutStore((state) => state.data.service)
  const setData = useSalesOrderCheckoutStore((state) => state.setData)

  const cartItems = cartStore((state) => state.items)
  const { data: spotPrices = [] } = useSpotPrices()

  const total = useMemo(() => {
    return cartItems.reduce((acc, item) => {
      const spot = spotPrices.find((s) => s.type === item.metal_type)
      const price = getProductPrice(item, spot)
      const qty = item.quantity ?? 1
      return acc + price * qty
    }, 0)
  }, [cartItems, spotPrices])

  const isHighValue = total > 1000

  const filteredOptions = isHighValue
    ? { FREE: salesOrderServiceOptions.FREE }
    : {
        STANDARD: salesOrderServiceOptions.STANDARD,
        OVERNIGHT: salesOrderServiceOptions.OVERNIGHT,
      }

  const currentValue = isHighValue ? 'FREE' : selected?.value ?? ''

  return (
    <div className="space-y-2">
      <RadioGroup
        value={currentValue}
        onValueChange={(serviceType) => {
          if (!isHighValue) {
            const option = salesOrderServiceOptions[serviceType]
            setData({ service: { ...option } })
          }
        }}
        className="gap-3 w-full flex flex-col"
      >
        {Object.entries(filteredOptions).map(([serviceKey, option]) => {
          const isDisabled = false

          return (
            <label
              key={serviceKey}
              htmlFor={serviceKey}
              className={cn(
                'raised-off-page relative peer flex flex-col items-start justify-center w-full gap-1 rounded-lg bg-background px-4 py-3 cursor-pointer transition-colors has-[[data-state=checked]]:bg-card has-[[data-state=checked]]:shadow-md',
                isDisabled && 'opacity-50 pointer-events-none'
              )}
            >
              <div className="flex items-center gap-2 text-sm font-medium text-neutral-800">
                {option.icon && (
                  <option.icon
                    size={24}
                    stroke={getCustomPrimaryIconStroke()}
                    color={getPrimaryIconStroke()}
                  />
                )}
                {option.label}
              </div>

              <div className="flex items-center w-full justify-between">
                <div className="text-sm text-neutral-600">{option.time}</div>
                <div className="text-base text-neutral-800">
                  <PriceNumberFlow value={option.cost} />
                </div>
              </div>

              <RadioGroupItem id={serviceKey} value={serviceKey} className="sr-only" />
            </label>
          )
        })}
      </RadioGroup>
    </div>
  )
}
