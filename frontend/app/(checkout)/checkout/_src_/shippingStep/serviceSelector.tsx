'use client'

import { Amount, RadioGroup, RadioOption } from '@dorado/components'
import { usePatchFulfillment } from '@/shared/hooks/checkout/queries'
import { formatTimeDiff } from '@/shared/utils/formatDates'
import { serviceIcon } from '@/shared/types/service'
import type { CheckoutRate, FulfillmentView } from '@dorado/contracts'

// ONE LIST, ALREADY JOINED. `GET /fulfillments/:id/rates` answers one entry
// per OFFERED service, carrying both the carrier's quote and the
// `shipping.services` id the PARCEL stores - so the browser no longer holds two
// lists and pairs them by `code`, and `selected` is the parcel's own answer to
// which one is chosen.
//
// NO ARITHMETIC ON A PRICE HERE, and there never was: netCharge is the
// carrier's own quote, rendered as given (D82).
export function ServiceSelector({
  rates,
  isLoading,
  fulfillment,
}: {
  rates: CheckoutRate[]
  isLoading: boolean
  fulfillment?: FulfillmentView
}) {
  const patchFulfillment = usePatchFulfillment()
  const selected = rates.find((rate) => rate.selected)

  return (
    <RadioGroup
      value={selected?.serviceType ?? ''}
      onValueChange={(code) => {
        const rate = rates.find((r) => r.serviceType === code)
        if (rate?.carrier_service_id && fulfillment) {
          patchFulfillment.mutate({
            fulfillment_id: fulfillment.fulfillment.id,
            shipment: { carrier_service_id: rate.carrier_service_id },
          })
        }
      }}
      className="flex w-full flex-col gap-3"
    >
      {rates.map((rate) => {
        const Icon = serviceIcon(rate.display_order)
        return (
          <RadioOption
            key={rate.serviceType ?? rate.carrier_service_id ?? rate.name}
            value={rate.serviceType ?? ''}
            disabled={rate.netCharge == null || rate.carrier_service_id == null}
            className="w-full flex-col items-start gap-1"
          >
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
                {rate.netCharge != null ? (
                  <Amount value={rate.netCharge} />
                ) : (
                  <>&nbsp;</>
                )}
              </strong>
            </div>
          </RadioOption>
        )
      })}
    </RadioGroup>
  )
}
