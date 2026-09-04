import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/shared/queries/axios'
import { usePaymentMethods } from '@/features/payments/queries'
import { useSaleShippingServices } from '@/features/shipping/queries'
import { AdminSaleCheckoutForm, SalesOrder } from '@/features/orders/salesOrders/types'
import { useApiQuery } from '@/shared/queries/base'
import { replaceCheckoutItems } from '@/features/checkout/items/queries'
import type { CheckoutLine } from '@/features/checkout/items/types'
import { queryKeys } from '@/shared/queries/keys'
import type { OrderView } from "@dorado/contracts";

// The admin mutation surface is per-resource under /orders now (D87 final
// form) - the order row via features/orders/patch.ts, the shipment via
// features/shipping/queries.ts. What stays here is the reads and the create.

export const useAdminSalesOrders = () =>
  useApiQuery<SalesOrder[]>({
    key: queryKeys.adminSalesOrders(),
    url: '/orders',
    method: 'GET',
    params: () => ({ direction: 'sale' }),
    requireUser: true,
    refetchInterval: 10000,
    staleTime: 10000,
  })

type AdminCreateSalesOrderVars = {
  paymentIntentId?: string
  sales_order: AdminSaleCheckoutForm
  items: CheckoutLine[]
}

// THE ADMIN-SCOPED ACCESSOR EXISTS NOW (D214 item 2: GET/PATCH
// /api/checkout?user_id= and PUT /api/checkout/items?user_id=,
// api/transport/checkout/controller.ts). The create is `POST
// /sales_orders/admin_create_sales_order { checkout_id }`: the address,
// items, service and payment method all live on a CHECKOUT ROW the server
// resolves by id, the same as the customer flow - mirroring
// features/orders/salesOrders/users/queries.ts useCreateSalesOrder, three
// calls against the NAMED customer's row instead of the caller's own:
//   1. freeze the drawer's item list onto the customer's buy basket;
//   2. resolve the two ids the checkout row wants (service CODE, payment
//      method TYPE) and PATCH their row, which answers with its own id;
//   3. POST the checkout_id - `createOrderFromCheckout` already lets an
//      admin name any checkout_id, ownership-check skipped for req.user.role
//      === "admin".
// `order_metals` and `using_funds` are not sent: the server prices from its
// own live feed and applies credit whenever the customer has a balance,
// exactly as the customer path does.
export const useAdminCreateSalesOrder = () => {
  const queryClient = useQueryClient()
  const { data: saleMethods = [] } = usePaymentMethods('sale')
  const { data: saleServices = [] } = useSaleShippingServices()

  return useMutation({
    mutationFn: async ({ sales_order, items }: AdminCreateSalesOrderVars) => {
      const user_id = sales_order.user.id
      if (!user_id) throw new Error('No customer named for this order')

      await replaceCheckoutItems('sale', items, user_id)

      const carrier_service_id =
        saleServices.find((s) => s.code === sales_order.service.value)?.id ?? null
      const payment_method_id =
        saleMethods.find((m) => m.type === sales_order.payment_method)?.id ?? null

      const { id: checkout_id } = await apiRequest<{ id: string }>(
        'PATCH',
        '/checkout',
        {
          direction: 'sale',
          recipient_address_id: sales_order.address.id,
          carrier_service_id,
          payment_method_id,
        },
        { user_id }
      )

      return await apiRequest<OrderView>('POST', '/sales_orders/admin_create_sales_order', {
        checkout_id,
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.adminSalesOrders(), refetchType: 'active' })
    },
  })
}
