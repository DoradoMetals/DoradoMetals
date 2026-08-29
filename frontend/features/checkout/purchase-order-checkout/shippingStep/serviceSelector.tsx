'use client'

import { RadioGroup } from '@/shared/ui/RadioGroup'
import { serviceOptions } from '@/features/service/types'
import { usePurchaseOrderCheckoutStore } from '@/shared/store/purchaseOrderCheckoutStore'
import { formatTimeDiff } from '@/shared/utils/formatDates'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import { ShippingRate } from '@/features/shipping/types'

interface ServiceSelectorProps {
  rates: ShippingRate[]
  isLoading: boolean
}

export const ServiceSelector: React.FC<ServiceSelectorProps> = ({ rates }) => {
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
    <RadioGroup
      value={selected?.serviceType ?? ''}
      onValueChange={handleSelect}
      options={serviceOptions}
      isOptionDisabled={(_, serviceType) => rateMap.get(serviceType)?.netCharge == null}
      className="flex w-full flex-col gap-3"
    >
      {(option, _checked, serviceType) => {
        const rate = rateMap.get(serviceType)
        return (
          <>
            <div className="flex items-center gap-2">
              {option.icon && <option.icon size={24} />}
              <strong>{option.serviceDescription}</strong>
            </div>
            <div className="flex w-full items-center justify-between">
              <small>
                {rate?.transitTime
                  ? formatTimeDiff(rate.transitTime)
                  : rate?.deliveryDay
                  ? `Arrives ${rate.deliveryDay}`
                  : 'Getting estimated delivery...'}
              </small>
              <strong>
                {rate?.netCharge != null ? <PriceNumberFlow value={rate.netCharge} /> : <>&nbsp;</>}
              </strong>
            </div>
          </>
        )
      }}
    </RadioGroup>
  )
}
