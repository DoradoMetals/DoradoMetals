'use client'

import { RadioGroup } from '@/shared/ui/RadioGroup'
import { usePatchCheckout } from '@/features/checkout/queries'
import { formatTimeDiff } from '@/shared/utils/formatDates'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import { serviceIcon } from '@/features/service/types'
import type { CheckoutRate } from '@dorado/contracts'

// ONE LIST, ALREADY JOINED. `GET /checkout/rates` answers one entry per
// OFFERED service, carrying both the carrier's quote and the
// `shipping.services` id the row stores - so the browser no longer holds two
// lists and pairs them by `code`, and `selected` is the row's own answer to
// which one is chosen.
//
// NO ARITHMETIC ON A PRICE HERE, and there never was: netCharge is the
// carrier's own quote, rendered as given (D82).
export function ServiceSelector({
  rates,
  isLoading,
}: {
  rates: CheckoutRate[]
  isLoading: boolean
}) {
  const patchCheckout = usePatchCheckout('purchase')
  const selected = rates.find((rate) => rate.selected)

  return (
    <RadioGroup
      value={selected?.serviceType ?? ''}
      onValueChange={(code) => {
        const rate = rates.find((r) => r.serviceType === code)
        if (rate?.carrier_service_id) {
          patchCheckout.mutate({ carrier_service_id: rate.carrier_service_id })
        }
      }}
      options={rates}
      getValue={(rate) => rate.serviceType ?? ''}
      isOptionDisabled={(rate) => rate.netCharge == null || rate.carrier_service_id == null}
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
                {rate.transitTime
                  ? formatTimeDiff(new Date(rate.transitTime))
                  : rate.deliveryDay
                  ? `Arrives ${rate.deliveryDay}`
                  : isLoading
                  ? 'Getting estimated delivery...'
                  : 'Not available for this parcel'}
              </small>
              <strong>
                {rate.netCharge != null ? <PriceNumberFlow value={rate.netCharge} /> : <>&nbsp;</>}
              </strong>
            </div>
          </>
        )
      }}
    </RadioGroup>
  )
}
