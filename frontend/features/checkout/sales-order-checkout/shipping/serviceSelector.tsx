'use client'

import { useEffect, useMemo } from 'react'
import { RadioGroup } from '@/shared/ui/RadioGroup'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import { useSalesOrderCheckoutStore } from '@/shared/store/salesOrderCheckoutStore'
import {
  saleServiceToOption,
  SalesOrderServiceUIOption,
} from '@/features/orders/salesOrders/types'
import { useSaleShippingServices } from '@/features/shipping/queries'
import type { quotes } from "@dorado/contracts";
import { DetailRow } from '@/shared/ui/DetailRow'

export default function ServiceSelector({ orderPrices }: { orderPrices?: quotes.SalesOrderQuote }) {
  const selected = useSalesOrderCheckoutStore((state) => state.data.service)
  const setData = useSalesOrderCheckoutStore((state) => state.setData)

  // The services are rows now (D207/D208); customers see the display ones.
  // Keyed by code for the RadioGroup, exactly as the hardcoded record was.
  const { data: services = [] } = useSaleShippingServices()
  const options = useMemo(() => {
    const out: Record<string, SalesOrderServiceUIOption> = {}
    for (const svc of services) {
      if (svc.display && svc.code) out[svc.code] = saleServiceToOption(svc)
    }
    return out
  }, [services])

  // HEAL THE STORE'S SEED. The store defaults to a static Standard before any
  // query resolves; once the rows arrive, the matching row's numbers replace
  // the seed so what the summary displays is what the business currently
  // charges. (The server prices shipping itself either way.)
  useEffect(() => {
    const live = selected?.value ? options[selected.value] : undefined
    if (live && (live.cost !== selected?.cost || live.time !== selected?.time)) {
      setData({ service: { ...live } })
    }
  }, [options, selected, setData])

  return (
    <div className="space-y-2">
      <p className="eyebrow">Shipping Service:</p>

      <RadioGroup
        value={selected?.value ?? ''}
        onValueChange={(key) => setData({ service: { ...options[key] } })}
        options={options}
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
