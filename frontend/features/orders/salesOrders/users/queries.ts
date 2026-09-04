import { useMutation } from '@tanstack/react-query'
import { usePlaceOrder } from '@dorado/client'
import { apiRequest } from '@/shared/queries/axios'
import { useBasket, useReplaceCheckoutItems } from '@/features/checkout/items/queries'
import { usePaymentMethods, useSaleShippingServices } from '@dorado/client'
import type { SaleCheckoutForm } from '@/features/orders/salesOrders/types'

// THE READS MOVED to @dorado/client - `useOrders({ direction: 'sale',
// user_id })`, `useOrder(id)`, `useCreateOrderReview`. What is left is the
// customer's own placement, which is an ORCHESTRATION for the same reason the
// admin one is: an order is placed from a CHECKOUT ROW, so the row is written
// and then named.
//
// using_funds and the spot feed are not sent at all: credit applies whenever
// the customer has a balance, and the server prices from its own feed
// regardless of what the browser last saw.
export const useCreateSalesOrder = () => {
  const { data: saleMethods = [] } = usePaymentMethods('sale')
  const { data: saleServices = [] } = useSaleShippingServices()
  const lines = useBasket('sale')
  const syncItems = useReplaceCheckoutItems('sale')
  const place = usePlaceOrder()

  return useMutation({
    mutationFn: async ({ sales_order }: { sales_order: SaleCheckoutForm }) => {
      // The rows the server already holds, re-PUT so the basket is exactly
      // what the order is about to be built from.
      await syncItems.mutateAsync({ lines })

      const { id: checkout_id } = await apiRequest<{ id: string }>('PATCH', '/checkout', {
        direction: 'sale',
        recipient_address_id: sales_order.address.id,
        carrier_service_id:
          saleServices.find((s) => s.code === sales_order.service.value)?.id ?? null,
        payment_method_id:
          saleMethods.find((m) => m.type === sales_order.payment_method)?.id ?? null,
      })

      return await place.mutateAsync({ checkout_id, direction: 'sale' })
    },
  })
}
