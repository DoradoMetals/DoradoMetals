import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AdminSalesOrderCheckout, SalesOrder } from '@/features/orders/salesOrders/types'
import { useApiQuery } from '@/shared/queries/base'
import { queryKeys } from '@/shared/queries/keys'

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
  sales_order: AdminSalesOrderCheckout
}

// BLOCKED ON A MISSING API ENDPOINT (D214 item 11, reported - not invented
// here). The create is `POST /sales_orders/admin_create_sales_order
// { checkout_id }` now: the address, items, service, payment method and spot
// overrides all live on a CHECKOUT ROW the server resolves by id, the same
// as the customer flow. But every checkout endpoint - GET/PATCH /checkout,
// POST /checkout/fulfillment, /checkout/payout, /cart/sync_cart,
// /cart/sync_sell_cart - reads the row through `callerId(req)` only
// (api/transport/checkout/controller.ts); none takes a `user_id`, so there
// is no way for an admin session to read, create or write a CUSTOMER's
// checkout row. `createOrderFromCheckout` itself already lets an admin name
// any checkout_id (it skips the ownership check for req.user.role ===
// "admin"), so the missing piece is narrow: an admin-scoped accessor for the
// row itself.
//
// Needed API change: something in the shape of
//   GET/PATCH /api/checkout?direction=sale&user_id=:id   (admin-only)
// (or an equivalent explicit "get-or-create the named customer's checkout"
// endpoint) so this hook can sync the target's items/address/service/payment
// method onto their row before naming its id here - mirroring
// features/orders/salesOrders/users/queries.ts useCreateSalesOrder, which
// already does this for the customer's OWN row via the existing endpoints.
//
// Until that exists, this refuses client-side rather than sending the old
// composed body (which the endpoint's strict `{ checkout_id }` schema would
// 400 on anyway) - the drawer's submit surfaces this as its usual "could not
// create the order" message.
export const useAdminCreateSalesOrder = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (_vars: AdminCreateSalesOrderVars): Promise<SalesOrder> => {
      throw new Error(
        'Admin sales-order create needs an admin-scoped checkout endpoint - ' +
          'see the comment above useAdminCreateSalesOrder in this file.'
      )
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.adminSalesOrders(), refetchType: 'active' })
    },
  })
}
