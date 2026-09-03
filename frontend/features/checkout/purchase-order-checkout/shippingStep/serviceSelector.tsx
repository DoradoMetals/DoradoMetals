'use client'

import { RadioGroup } from '@/shared/ui/RadioGroup'
import { usePurchaseOrderCheckoutStore } from '@/shared/store/purchaseOrderCheckoutStore'
import { formatTimeDiff } from '@/shared/utils/formatDates'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import { serviceIcon } from '@/features/service/types'
import type { CheckoutRate } from '@/features/checkout/queries'

// THE SERVICES WE OFFER, ALREADY PRICED (rates ruling): GET /checkout/rates
// answers one flat row per offered service - a name, its codes and the
// carrier's own quote - so there is no separate catalogue to join by code any
// more. The browser assembles no rate request.
//
// Presentational: rates in, selection out (ruling 14).
//
// NO ARITHMETIC ON A PRICE HERE, and there never was: net_charge is the
// carrier's own quote, rendered and stored as given (D82).
interface ServiceSelectorProps {
  rates: CheckoutRate[]
  isLoading: boolean
}

export const ServiceSelector: React.FC<ServiceSelectorProps> = ({ rates }) => {
  const selected = usePurchaseOrderCheckoutStore((state) => state.data.service)
  const setData = usePurchaseOrderCheckoutStore((state) => state.setData)
  const pickup = usePurchaseOrderCheckoutStore((state) => state.data.pickup)

  const handleSelect = (code: string) => {
    const rate = rates.find((r) => r.code === code)
    if (!rate) return

    setData({
      service: {
        // The shipping.services ROW id - what the checkout row stores (D208).
        id: rate.id ?? undefined,
        // serviceType and code are the carrier's, received from the server and
        // handed back - the create body still carries them into the label
        // request. The frontend does not interpret either.
        serviceType: rate.code,
        serviceDescription: rate.name,
        code: rate.carrier_code,
        netCharge: rate.net_charge,
        currency: rate.currency,
        transitTime: rate.transit_time ? new Date(rate.transit_time) : new Date(),
        deliveryDay: rate.delivery_day ?? '',
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
      options={rates}
      getValue={(rate) => rate.code}
      isOptionDisabled={(rate) => rate.net_charge == null}
      className="flex w-full flex-col gap-3"
    >
      {(rate) => {
        const Icon = serviceIcon(rate.display_order)
        return (
          <>
            <div className="flex items-center gap-2">
              <Icon size={24} />
              <strong>{rate.name}</strong>
            </div>
            <div className="flex w-full items-center justify-between">
              <small>
                {rate.transit_time
                  ? formatTimeDiff(new Date(rate.transit_time))
                  : rate.delivery_day
                  ? `Arrives ${rate.delivery_day}`
                  : 'Getting estimated delivery...'}
              </small>
              <strong>
                {rate.net_charge != null ? <PriceNumberFlow value={rate.net_charge} /> : <>&nbsp;</>}
              </strong>
            </div>
          </>
        )
      }}
    </RadioGroup>
  )
}
