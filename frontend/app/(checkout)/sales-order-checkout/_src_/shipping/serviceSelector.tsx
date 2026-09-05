'use client'

import { useMemo } from 'react'
import { Amount, RadioGroup, RadioOption } from '@dorado/components'
import { usePatchFulfillment } from '@/shared/hooks/checkout/queries'
import { saleServiceToOption } from '@/shared/types/salesOrders'
import { useSaleShippingServices } from '@dorado/client'
import type { FulfillmentView, SaleQuote } from '@dorado/contracts'

// THE SELECTION IS THE PARCEL'S `carrier_service_id` (rulings 69/70, migration
// 128), so the "heal the store's seed" effect is gone with the seed: the store
// used to default to a static Standard service and then an effect copied the
// live row's numbers over it once the catalogue loaded. There is nothing to
// heal - the parcel holds an id or it holds null, and the catalogue supplies
// the label and the price beside it.
export default function ServiceSelector({
  fulfillment,
  orderPrices,
}: {
  fulfillment?: FulfillmentView
  orderPrices?: SaleQuote
}) {
  const patchFulfillment = usePatchFulfillment()
  const { data: services = [] } = useSaleShippingServices()

  const options = useMemo(() => services.filter((svc) => svc.display && svc.code), [services])
  const selected = options.find((svc) => svc.id === fulfillment?.parcel?.carrier_service_id)

  return (
    <div className="space-y-2">
      <p className="eyebrow">Shipping Service:</p>

      <RadioGroup
        value={selected?.code ?? ''}
        onValueChange={(code) => {
          const svc = options.find((s) => s.code === code)
          if (svc?.id && fulfillment) {
            patchFulfillment.mutate({
              fulfillment_id: fulfillment.fulfillment.id,
              shipment: { carrier_service_id: svc.id },
            })
          }
        }}
        className="flex w-full flex-col gap-3"
      >
        {options.map((svc) => {
          const option = saleServiceToOption(svc)
          return (
            <RadioOption
              key={svc.code ?? svc.id}
              value={svc.code ?? ''}
              className="w-full flex-col items-start gap-1"
            >
              <div className="flex items-center gap-2">
                {option.icon && <option.icon size={24} />}
                <strong>{option.label}</strong>
              </div>
              <div className="flex w-full items-center justify-between gap-2">
                <small>{option.time}</small>
                {/* Only the selected service is quoted, so the unselected
                    options' display keys the free-shipping threshold off the
                    quote's item_total - the same rule getShippingCharge
                    applies server-side. */}
                <strong>
                  <Amount value={(orderPrices?.item_total ?? 0) > 1000 ? 0 : option.cost} />
                </strong>
              </div>
            </RadioOption>
          )
        })}
      </RadioGroup>
    </div>
  )
}
