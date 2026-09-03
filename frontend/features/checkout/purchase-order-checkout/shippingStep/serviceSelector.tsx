'use client'

import { RadioGroup } from '@/shared/ui/RadioGroup'
import { usePurchaseOrderCheckoutStore } from '@/shared/store/purchaseOrderCheckoutStore'
import { formatTimeDiff } from '@/shared/utils/formatDates'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import { serviceIcon } from '@/features/service/types'
import type { CarrierServiceOption } from '@/features/shipping/types'
import type { CarrierRateQuote } from '@dorado/contracts'

// THE SERVICES WE OFFER, JOINED TO THE CARRIER'S OWN QUOTE BY `code`.
//
// GET /checkout/rates answers the carrier's raw per-service quote
// (CarrierRateQuote) - not every field ties to a shipping.services row (no
// id, no display order), so the offered catalogue (GET
// /carrier_services/offered) is still read separately and joined here, same
// as the deleted client-side rate assembly did. The browser composes no rate
// REQUEST any more; it still joins the ANSWER to the catalogue it already
// caches.
//
// Presentational: options and rates in, selection out (ruling 14).
//
// NO ARITHMETIC ON A PRICE HERE, and there never was: netCharge is the
// carrier's own quote, rendered and stored as given (D82).
interface ServiceSelectorProps {
  services: CarrierServiceOption[]
  rates: CarrierRateQuote[]
  isLoading: boolean
}

export const ServiceSelector: React.FC<ServiceSelectorProps> = ({ services, rates }) => {
  const selected = usePurchaseOrderCheckoutStore((state) => state.data.service)
  const setData = usePurchaseOrderCheckoutStore((state) => state.setData)
  const pickup = usePurchaseOrderCheckoutStore((state) => state.data.pickup)

  const rateMap = new Map(
    rates.filter((r) => r.serviceType != null).map((r) => [r.serviceType as string, r])
  )

  const handleSelect = (code: string) => {
    const option = services.find((s) => s.code === code)
    if (!option) return
    const rate = rateMap.get(code)

    setData({
      service: {
        // The shipping.services ROW id - what the checkout row stores (D208).
        id: option.id ?? undefined,
        // serviceType and code are the carrier's, received from the server and
        // handed back - the create body still carries them into the label
        // request. The frontend does not interpret either.
        serviceType: option.code,
        serviceDescription: option.name,
        code: option.carrier_code,
        netCharge: rate?.netCharge ?? 0,
        currency: rate?.currency ?? 'USD',
        transitTime: rate?.transitTime ? new Date(rate.transitTime) : new Date(),
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
      options={services}
      getValue={(option) => option.code}
      isOptionDisabled={(option) => rateMap.get(option.code)?.netCharge == null}
      className="flex w-full flex-col gap-3"
    >
      {(option) => {
        const rate = rateMap.get(option.code)
        const Icon = serviceIcon(option.display_order)
        return (
          <>
            <div className="flex items-center gap-2">
              <Icon size={24} />
              <strong>{option.name}</strong>
            </div>
            <div className="flex w-full items-center justify-between">
              <small>
                {rate?.transitTime
                  ? formatTimeDiff(new Date(rate.transitTime))
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
