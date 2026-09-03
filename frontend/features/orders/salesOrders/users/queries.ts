import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/shared/queries/axios'
import { useGetSession } from '@/features/auth/queries'
import { cartStore } from '@/shared/store/cartStore'
import { buyLine } from '@/features/cart/queries'
import { usePaymentMethods } from '@/features/payments/queries'
import { useSaleShippingServices } from '@/features/shipping/queries'
import { SalesOrder, SalesOrderCheckout } from '@/features/orders/salesOrders/types'
import { toAddressSnapshot } from '@/features/orders/addressSnapshot'
import { useApiMutation, useApiQuery } from '@/shared/queries/base'
import { queryKeys } from '@/shared/queries/keys'
import type { orders } from "@dorado/contracts";

// toAddressSnapshot moved to features/orders/addressSnapshot.ts - one copy
// for both directions and the cancel op, which had three.
export { toAddressSnapshot }

export const useSalesOrders = () => {
  return useApiQuery<SalesOrder[]>({
    key: queryKeys.salesOrders(),
    url: '/orders',
    requireUser: true,
    enabled: (user) => !!user?.id,
    // Self-scoped even for an admin caller - see usePurchaseOrders.
    params: (user) => ({
      direction: 'sale',
      user_id: user!.id,
    }),
    refetchInterval: 10_000,
  })
}

// THE CREATE IS ONE ID NOW (D214 item 11): the composed body - address,
// items, service, payment method, spot prices, the intent id - is gone. Every
// one of those is a column of the customer's OWN checkout row or its items,
// so this hook's job changed from "send the document" to "write the row,
// then name it":
//
//   1. freeze the live buy basket onto checkout.items (the periodic auto-sync
//      in features/cart/queries.ts can be up to 15s stale by Confirm);
//   2. resolve the two ids the checkout row wants from what the stepper
//      already picked - the service's CODE against the cached shipping.services
//      rows, the payment method's TYPE against the cached payments.methods
//      rows - and PATCH the row, which answers with its own id;
//   3. POST the checkout_id.
//
// using_funds and the spot feed are not sent at all: credit applies whenever
// the customer has a balance now (a behaviour change, flagged in
// docs/waves/orders-shape-changes.md §1), and the server prices from its own
// feed regardless of what the browser last saw.
export const useCreateSalesOrder = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()
  const { data: saleMethods = [] } = usePaymentMethods('sale')
  const { data: saleServices = [] } = useSaleShippingServices()

  return useMutation({
    mutationFn: async ({ sales_order }: { sales_order: SalesOrderCheckout }) => {
      if (!user?.id) throw new Error('User is not authenticated')

      await apiRequest(
        'PUT',
        '/checkout/items',
        { items: cartStore.getState().items.map(buyLine) },
        { direction: 'sale' }
      )

      const carrier_service_id =
        saleServices.find((s) => s.code === sales_order.service.value)?.id ?? null
      const payment_method_id =
        saleMethods.find((m) => m.type === sales_order.payment_method)?.id ?? null

      const { id: checkout_id } = await apiRequest<{ id: string }>('PATCH', '/checkout', {
        direction: 'sale',
        recipient_address_id: sales_order.address.id,
        carrier_service_id,
        payment_method_id,
      })

      return await apiRequest<orders.orders.View>('POST', '/sales_orders/create_sales_order', {
        checkout_id,
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.salesOrders(), refetchType: 'active' })
    },
  })
}

export const useSetReviewCreated = () => {
  return useApiMutation<SalesOrder, { sales_order: SalesOrder }, SalesOrder[]>({
    queryKey: queryKeys.salesOrders(),
    url: '/sales_orders/create_review',
    method: 'POST',
    requireUser: true,
    listAction: 'upsert',
    optimisticUpdater: (list, { sales_order }) => {
      const orders = list ?? []
      return orders.map((order) =>
        order.id !== sales_order.id ? order : { ...order, review_created: true }
      )
    },
    body: (vars, user) => ({
      user_id: user!.id,
      order: vars.sales_order,
    }),
  })
}
