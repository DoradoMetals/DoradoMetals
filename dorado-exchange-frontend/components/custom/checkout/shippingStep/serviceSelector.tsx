'use client'

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import { CheckCircle } from 'lucide-react'
import { FedexRate } from '@/types/shipping'
import { serviceOptions } from '@/types/service'
import PriceNumberFlow from '../../products/PriceNumberFlow'
import { usePurchaseOrderCheckoutStore } from '@/store/purchaseOrderCheckoutStore'

interface ServiceSelectorProps {
  rates: FedexRate[]
  isLoading: boolean
}

export const ServiceSelector: React.FC<ServiceSelectorProps> = ({ rates, isLoading }) => {
  const selected = usePurchaseOrderCheckoutStore((state) => state.data.service)
  const setData = usePurchaseOrderCheckoutStore((state) => state.setData)

  const rateMap = new Map(rates.map((r) => [r.serviceType, r]))

  const handleSelect = (serviceType: string) => {
    const option = serviceOptions[serviceType]
    const rate = rateMap.get(serviceType)

    if (!option || !rate || rate.netCharge == null || rate.currency == null) return

    setData({
      service: {
        ...option,
        serviceType,
        netCharge: rate.netCharge,
        currency: rate.currency,
        transitTime: rate.transitTime ?? new Date(),
        deliveryDay: rate.deliveryDay ?? '',
      },
    })
  }

  return (
    <div className="space-y-2">
      <h2 className="text-xs text-neutral-600 tracking-widest mb-4">Shipping Service</h2>
      <RadioGroup
        value={selected?.serviceType ?? ''}
        onValueChange={handleSelect}
        className="gap-3 w-full flex flex-col"
      >
        {Object.entries(serviceOptions).map(([serviceType, option]) => {
          const rate = rateMap.get(serviceType)
          const isSelected = selected?.serviceType === serviceType

          return (
            <label
              key={serviceType}
              htmlFor={serviceType}
              className={cn(
                'relative peer flex flex-col items-start justify-center w-full gap-1 rounded-lg border border-border bg-background px-4 py-3 cursor-pointer transition-colors has-[[data-state=checked]]:bg-card has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:shadow-md'
              )}
            >
              <div className="absolute top-2 right-2">
                {isSelected && <CheckCircle size={16} className="text-primary" />}
              </div>

              <div className="flex items-center gap-2 text-sm font-medium text-neutral-900">
                {option.icon && <option.icon size={20} className='text-primary' />}
                {option.serviceDescription}
              </div>

              <div className="flex items-center w-full justify-between">
                <div className="text-sm text-neutral-600">
                  {rate?.transitTime
                    ? `Arrives ${new Date(rate.transitTime).toLocaleDateString(undefined, {
                        weekday: 'short',
                      })} by ${new Date(rate.transitTime).toLocaleTimeString(undefined, {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}`
                    : rate?.deliveryDay
                    ? `Arrives ${rate.deliveryDay}`
                    : 'Estimated delivery'}
                </div>
                <div className="text-base text-neutral-800">
                  <PriceNumberFlow value={rate?.netCharge ?? 0} />
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
