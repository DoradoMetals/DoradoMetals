'use client'

import { RadioGroup, RadioGroupItem } from '@/shared/ui/base/radio-group'
import { cn } from '@/shared/utils/cn'
import PriceNumberFlow from '../../../../shared/ui/PriceNumberFlow'
import { useSalesOrderCheckoutStore } from '@/store/salesOrderCheckoutStore'
import { salesOrderServiceOptions, SalesOrderTotals } from '@/types/sales-orders'

export default function ServiceSelector({ orderPrices }: { orderPrices: SalesOrderTotals }) {
  const selected = useSalesOrderCheckoutStore((state) => state.data.service)
  const setData = useSalesOrderCheckoutStore((state) => state.setData)

  function handleServiceChange(serviceKey: string) {
    const option = salesOrderServiceOptions[serviceKey]

    setData({
      service: {
        ...option,
      },
    })
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-neutral-600 uppercase tracking-widest">Shipping Service:</div>

      <RadioGroup
        value={selected?.value ?? ''}
        onValueChange={handleServiceChange}
        className="gap-3 w-full flex flex-col"
      >
        {Object.entries(salesOrderServiceOptions).map(([serviceKey, option]) => {
          return (
            <label
              key={serviceKey}
              htmlFor={serviceKey}
              className={cn(
                'raised-off-page relative peer flex flex-col items-start justify-center w-full gap-1 rounded-lg bg-background px-4 py-3 cursor-pointer transition-colors has-[[data-state=checked]]:bg-card has-[[data-state=checked]]:shadow-md'
              )}
            >
              <div className="flex items-center gap-2 text-base font-medium text-neutral-800">
                {option.icon && <option.icon size={24} className="text-primary" />}
                {option.label}
              </div>

              <div className="flex items-center w-full justify-between">
                <div className="text-sm text-neutral-600">{option.time}</div>
                <div className="text-base text-neutral-800">
                  <PriceNumberFlow value={orderPrices?.itemTotal > 1000 ? 0 : option.cost} />
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
