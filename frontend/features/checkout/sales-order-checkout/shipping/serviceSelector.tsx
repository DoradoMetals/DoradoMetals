'use client'

import { RadioGroup } from '@/shared/ui/RadioGroup'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import { useSalesOrderCheckoutStore } from '@/shared/store/salesOrderCheckoutStore'
import { salesOrderServiceOptions } from '@/features/orders/salesOrders/types'
import type { SalesOrderQuote } from '@dorado/contracts'
import { DetailRow } from '@/shared/ui/DetailRow'

export default function ServiceSelector({ orderPrices }: { orderPrices?: SalesOrderQuote }) {
  const selected = useSalesOrderCheckoutStore((state) => state.data.service)
  const setData = useSalesOrderCheckoutStore((state) => state.setData)

  return (
    <div className="space-y-2">
      <p className="eyebrow">Shipping Service:</p>

      <RadioGroup
        value={selected?.value ?? ''}
        onValueChange={(key) => setData({ service: { ...salesOrderServiceOptions[key] } })}
        options={salesOrderServiceOptions}
        className="flex w-full flex-col gap-3"
      >
        {(option) => (
          <>
            <div className="flex items-center gap-2">
              {option.icon && <option.icon size={24} />}
              <strong>{option.label}</strong>
            </div>
            <DetailRow label={option.time} variant="subtotal">
              {/* Only the selected service is quoted, so the unselected
                  options' display keys the free-shipping threshold off the
                  quote's item_total - the same rule getShippingCharge
                  applies server-side. */}
              <PriceNumberFlow value={(orderPrices?.item_total ?? 0) > 1000 ? 0 : option.cost} />
            </DetailRow>
          </>
        )}
      </RadioGroup>
    </div>
  )
}
