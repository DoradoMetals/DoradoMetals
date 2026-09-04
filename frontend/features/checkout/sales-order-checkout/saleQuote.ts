'use client'

import { useSalesQuote } from '@dorado/client'
import type { CheckoutView, SalesOrderQuote } from '@dorado/contracts'
import type { CheckoutLine } from '@/features/checkout/items/types'

// THE SALE QUOTE IS THE ROW, PRICED. Its body used to be assembled from three
// store fields plus two reference-list lookups that turned a service CODE and
// a payment-method TYPE back into ids; the row already holds both ids, so the
// body is the row and the basket and nothing is resolved in the browser.
export function useSaleQuoteFor(
  row: CheckoutView | undefined,
  items: CheckoutLine[]
): SalesOrderQuote | undefined {
  const lines = items.flatMap((item) =>
    item.bullion_id ? [{ id: item.bullion_id, quantity: item.quantity ?? 1 }] : []
  )
  const { data } = useSalesQuote(
    {
      items: lines,
      address_id: row?.recipient_address_id ?? undefined,
      carrier_service_id: row?.carrier_service_id ?? undefined,
      payment_method_id: row?.payment_method_id ?? undefined,
    },
    { enabled: !!row }
  )
  return data
}
