import {
  useAdminPlaceSalesOrder,
  useCreateFulfillment,
  usePatchCheckout,
  usePatchFulfillment,
  usePaymentMethods,
} from '@dorado/client'
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
//
// No `useMutation` here (ruling 62 - frontend/ imports the query library
// nowhere but the provider now): each step is one of @dorado/client's own
// mutations, composed in a plain async function the same way
// useReplaceCheckoutItems wraps one.
export const useAdminCreateSalesOrder = (user_id: string) => {
  const { data: saleMethods = [] } = usePaymentMethods('sale')
  const { data: saleServices = [] } = useSaleShippingServices()
  const syncItems = useReplaceCheckoutItems('sale')
  const patchCheckout = usePatchCheckout('sale', { user_id })
  const createFulfillment = useCreateFulfillment()
  const patchFulfillment = usePatchFulfillment()
  const place = useAdminPlaceSalesOrder()

  const mutateAsync = async (
    { sales_order, items }: { sales_order: AdminSaleCheckoutForm; items: CheckoutLine[] }
  ) => {
    await syncItems.mutateAsync({ lines: items, user_id })

    const checkout = await patchCheckout.mutateAsync({
      recipient_address_id: sales_order.address.id,
      payment_method_id:
        saleMethods.find((m) => m.type === sales_order.payment_method)?.id ?? null,
    })

    // THE DELIVERY SERVICE IS THE PARCEL'S (rulings 69/70, migration 128), and
    // every checkout needs a draft fulfillment to be placeable. Two calls where
    // there was one column, and the same substitution the customer surfaces
    // got - this file is otherwise untouched.
    const draft = await createFulfillment.mutateAsync({ checkout_id: checkout.id })
    await patchFulfillment.mutateAsync({
      fulfillment_id: draft.fulfillment.id,
      shipment: {
        carrier_service_id:
          saleServices.find((s) => s.code === sales_order.service.value)?.id ?? null,
      },
    })

    return await place.mutateAsync({ checkout_id: checkout.id })
  }

  return {
    mutateAsync,
    mutate: (
      vars: { sales_order: AdminSaleCheckoutForm; items: CheckoutLine[] },
      options?: { onSuccess?: (view: Awaited<ReturnType<typeof mutateAsync>>) => void }
    ) => {
      mutateAsync(vars).then((view) => options?.onSuccess?.(view)).catch(() => {})
    },
    isPending:
      syncItems.isPending
      || patchCheckout.isPending
      || createFulfillment.isPending
      || patchFulfillment.isPending
      || place.isPending,
    error:
      syncItems.error
      ?? patchCheckout.error
      ?? createFulfillment.error
      ?? patchFulfillment.error
      ?? place.error,
  }
}
