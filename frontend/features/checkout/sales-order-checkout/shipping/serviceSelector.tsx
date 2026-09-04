'use client'

import { useMemo } from 'react'
import { RadioGroup, RadioOption } from '@dorado/components'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import { usePatchCheckout } from '@/features/checkout/queries'
import { saleServiceToOption } from '@/features/orders/salesOrders/types'
import { useSaleShippingServices } from '@/features/shipping/queries'
import type { CheckoutView, SalesOrderQuote } from '@dorado/contracts'
import { DetailRow } from '@/shared/ui/DetailRow'

// THE SELECTION IS THE ROW'S `carrier_service_id`, so the "heal the store's
// seed" effect is gone with the seed: the store used to default to a static
// Standard service and then an effect copied the live row's numbers over it
// once the catalogue loaded. There is nothing to heal - the row holds an id or
// it holds null, and the catalogue supplies the label and the price beside it.
export default function ServiceSelector({
  row,
  orderPrices,
}: {
  row?: CheckoutView
  orderPrices?: SalesOrderQuote
}) {
  const patchCheckout = usePatchCheckout('sale')
  const { data: services = [] } = useSaleShippingServices()

  const options = useMemo(
    () => services.filter((svc) => svc.display && svc.code),
    [services]
  )
  const selected = options.find((svc) => svc.id === row?.carrier_service_id)

  return (
    <div className="space-y-2">
      <p className="eyebrow">Shipping Service:</p>

      <RadioGroup
        value={selected?.code ?? ''}
        onValueChange={(code) => {
          const svc = options.find((s) => s.code === code)
          if (svc?.id) patchCheckout.mutate({ carrier_service_id: svc.id })
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
              <DetailRow label={option.time} variant="subtotal">
                {/* Only the selected service is quoted, so the unselected
                    options' display keys the free-shipping threshold off the
                    quote's item_total - the same rule getShippingCharge
                    applies server-side. */}
                <PriceNumberFlow
                  value={(orderPrices?.item_total ?? 0) > 1000 ? 0 : option.cost}
                  className="tabular-nums"
                />
              </DetailRow>
            </RadioOption>
          )
        })}
      </RadioGroup>
    </div>
  )
}
