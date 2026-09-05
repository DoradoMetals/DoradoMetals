import { useAdminCreateOrder, useFulfillmentMethods, usePaymentMethods } from '@dorado/client'
import { useSaleShippingServices } from '../../shipping/queries'
import type { AdminSaleCheckoutForm } from '@/shared/types/salesOrders'
import type { CheckoutItemPatch } from '@dorado/contracts'

// AN ADMIN PLACING A SALE IS ONE CALL NOW (orders pass 2). It was five - sync
// the customer's basket, patch their checkout, create a draft fulfillment,
// patch its parcel, then place - and every one of those steps is a use case
// `orders/place.ts` `placeForAdmin` runs server-side, inside ONE transaction,
// before handing the checkout to the same `place()` a customer's own order
// goes through. Orchestrating it from a browser meant five round trips with
// four places to fail half-way.
//
// The two lookups that survive are the two the body wants as IDS and this
// drawer holds as a CODE and a TYPE - a shipping service and a payment
// method - resolved against reference lists the drawer already caches.
export const useAdminCreateSalesOrder = (user_id: string) => {
  const { data: saleMethods = [] } = usePaymentMethods('sale')
  const { data: saleServices = [] } = useSaleShippingServices()
  const { data: fulfillmentMethods = [] } = useFulfillmentMethods('sale')
  const create = useAdminCreateOrder()

  const bodyFor = (sales_order: AdminSaleCheckoutForm, items: CheckoutItemPatch[]) => ({
    direction: 'sale' as const,
    user_id,
    items,
    fulfillment: {
      method_id: fulfillmentMethods.find((m) => m.type === 'SHIPMENT')?.id ?? '',
      choices: {
        shipment: {
          carrier_service_id:
            saleServices.find((s) => s.code === sales_order.service.value)?.id ?? null,
          recipient_address_id: sales_order.address.id,
        },
      },
    },
    payment_method_id:
      saleMethods.find((m) => m.type === sales_order.payment_method)?.id ?? '',
    recipient_address_id: sales_order.address.id,
  })

  return {
    ...create,
    mutateAsync: async (
      vars: { sales_order: AdminSaleCheckoutForm; items: CheckoutItemPatch[] }
    ) => await create.mutateAsync(bodyFor(vars.sales_order, vars.items)),
    mutate: (
      vars: { sales_order: AdminSaleCheckoutForm; items: CheckoutItemPatch[] },
      options?: { onSuccess?: () => void }
    ) => create.mutate(bodyFor(vars.sales_order, vars.items), { onSuccess: options?.onSuccess }),
  }
}
