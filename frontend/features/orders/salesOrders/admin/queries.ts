import { useMutation } from '@tanstack/react-query'
import { useAdminPlaceSalesOrder } from '@dorado/client'
import { apiRequest } from '@/shared/queries/axios'
import { usePaymentMethods } from '@dorado/client'
import { useSaleShippingServices } from '@/features/shipping/queries'
import { useReplaceCheckoutItems } from '@/features/checkout/items/queries'
import type { AdminSaleCheckoutForm } from '@/features/orders/salesOrders/types'
import type { CheckoutLine } from '@/features/checkout/items/types'

// THE READS MOVED to @dorado/client - `useOrders({ direction: 'sale' })` and
// `useOrder(id)`. What is left here is the one thing that is genuinely an
// ORCHESTRATION rather than an endpoint: an admin placing a sale on behalf of
// a named customer.
//
// It is three calls because the order is placed from a CHECKOUT ROW and that
// row is the customer's:
//
//   1. freeze the drawer's item list onto that customer's buy basket;
//   2. PATCH their checkout with the two ids the row wants - the service and
//      the payment method - which answers with the row's own id;
//   3. POST the checkout_id.
//
// Nothing else crosses the wire. `order_metals` and `using_funds` are not
// sent: the server prices from its own live feed and applies credit whenever
// the customer has a balance.
export const useAdminCreateSalesOrder = () => {
  const { data: saleMethods = [] } = usePaymentMethods('sale')
  const { data: saleServices = [] } = useSaleShippingServices()
  const syncItems = useReplaceCheckoutItems('sale')
  const place = useAdminPlaceSalesOrder()

  return useMutation({
    mutationFn: async (
      { sales_order, items }: { sales_order: AdminSaleCheckoutForm; items: CheckoutLine[] }
    ) => {
      const user_id = sales_order.user.id
      if (!user_id) throw new Error('No customer named for this order')

      await syncItems.mutateAsync({ lines: items, user_id })

      const { id: checkout_id } = await apiRequest<{ id: string }>(
        'PATCH',
        '/checkout',
        {
          direction: 'sale',
          recipient_address_id: sales_order.address.id,
          carrier_service_id:
            saleServices.find((s) => s.code === sales_order.service.value)?.id ?? null,
          payment_method_id:
            saleMethods.find((m) => m.type === sales_order.payment_method)?.id ?? null,
        },
        { user_id }
      )

      return await place.mutateAsync({ checkout_id })
    },
  })
}
