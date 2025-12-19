'use client'

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import { FedexRate } from '@/types/fedex'
import { serviceOptions } from '@/types/service'
import PriceNumberFlow from '../../products/PriceNumberFlow'
import { usePurchaseOrderCheckoutStore } from '@/store/purchaseOrderCheckoutStore'
import { formatTimeDiff } from '@/utils/dateFormatting'

interface ServiceSelectorProps {
  rates: FedexRate[]
  isLoading: boolean
}

export const ServiceSelector: React.FC<ServiceSelectorProps> = ({ rates, isLoading }) => {
  const selected = usePurchaseOrderCheckoutStore((state) => state.data.service)
  const setData = usePurchaseOrderCheckoutStore((state) => state.setData)
  const pickup = usePurchaseOrderCheckoutStore((state) => state.data.pickup)

  const rateMap = new Map(rates.map((r) => [r.serviceType, r]))

  const handleSelect = (serviceType: string) => {
    const option = serviceOptions[serviceType]
    const rate = rateMap.get(serviceType)

    setData({
      service: {
        ...option,
        serviceType,
        serviceDescription: option.serviceDescription ?? '',
        netCharge: rate?.netCharge || 0,
        currency: rate?.currency || 'USD',
        transitTime: rate?.transitTime ?? new Date(),
        deliveryDay: rate?.deliveryDay ?? '',
      },
      pickup: {
        ...pickup,
        label: pickup?.label ?? '',
        name: pickup?.name ?? '',
        selectedDate: undefined,
        time: undefined,
        date: undefined,
      },
    })
  }

  return (
    <div className="space-y-2">
      <RadioGroup
        value={selected?.serviceType ?? ''}
        onValueChange={handleSelect}
        className="gap-3 w-full flex flex-col"
      >
        {Object.entries(serviceOptions).map(([serviceType, option]) => {
          const rate = rateMap.get(serviceType)
          const isDisabled = rate?.netCharge == null

          return (
            <label
              key={serviceType}
              htmlFor={serviceType}
              className={cn(
                'raised-off-page relative peer flex flex-col items-start justify-center w-full gap-1 rounded-lg bg-background px-4 py-3 cursor-pointer transition-colors has-[[data-state=checked]]:bg-card has-[[data-state=checked]]:shadow-md',
                isDisabled && 'opacity-50 pointer-events-none'
              )}

            >
              <div className="flex items-center gap-2 text-sm font-medium text-neutral-800">
                {option.icon && <option.icon size={24} className='text-primary' />}
                {option.serviceDescription}
              </div>

              <div className="flex items-center w-full justify-between">
                <div className="text-sm text-neutral-600">
                  {rate?.transitTime
                    ? formatTimeDiff(rate.transitTime)
                    : rate?.deliveryDay
                    ? `Arrives ${rate.deliveryDay}`
                    : 'Getting estimated delivery...'}
                </div>
                <div className="text-base text-neutral-800">
                  {rate?.netCharge != null ? (
                    <PriceNumberFlow value={rate.netCharge} />
                  ) : (
                    <span className="text-neutral-500 select-none">&nbsp;</span>
                  )}
                </div>
              </div>

              <RadioGroupItem id={serviceType} value={serviceType} className="sr-only" />
            </label>
          )
        })}
      </RadioGroup>
    </div>
  )
}