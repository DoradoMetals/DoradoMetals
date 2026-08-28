import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/shared/queries/axios'
import { PurchaseOrder, PurchaseOrderCheckout } from '@/features/orders/purchaseOrders/types'
import type { OrderAddressSnapshot } from '@dorado/contracts'
import type { Address, UserAddress } from '@/features/addresses/types'
import { payoutOptions } from '@/features/payouts/types'
import { packageOptions } from '@/features/packaging/types'
import { useGetSession } from '@/features/auth/queries'
import { useSpotPrices } from '@/features/spots/queries'

// The order's address on the wire is a SNAPSHOT - immutable postal facts plus
// the recipient - while the checkout keeps the picked pair (the book address
// and the caller's relationship to it) as client state. The snapshot is built
// HERE, at the mutation edge: recipient_name is the relationship's label (the
// API reads it for the FedEx label's personName), address_id is the book row
// the checkout resolved against.
const toAddressSnapshot = (a: Address, ua?: UserAddress | null): OrderAddressSnapshot => ({
  address_id: a.id ?? null,
  recipient_name: ua?.label ?? null,
  line_1: a.line_1,
  line_2: a.line_2,
  city: a.city,
  state: a.state,
  country: a.country,
  country_code: a.country_code,
  zip: a.zip,
  phone_number: a.phone_number,
  is_residential: a.is_residential,
  is_valid: a.is_valid,
})

export const usePurchaseOrders = () => {
  const { user } = useGetSession()

  return useQuery<PurchaseOrder[]>({
    queryKey: ['purchase_orders', user?.id],
    queryFn: async () => {
      if (!user?.id) return []
      // The unified list. user_id pins the row scope to the caller even when
      // the caller is an admin (whom GET /orders otherwise serves ALL rows) -
      // the same self-scope the legacy route's param gave this list.
      return await apiRequest<PurchaseOrder[]>('GET', '/orders', undefined, {
        direction: 'purchase',
        user_id: user.id,
      })
    },
    enabled: !!user,
    refetchInterval: 10000,
  })
}

export const useCreatePurchaseOrder = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()
  const { data: spotPrices = [] } = useSpotPrices()

  return useMutation({
    mutationFn: async (purchase_order: PurchaseOrderCheckout) => {
      if (!user?.id) throw new Error('User is not authenticated')
      // The body carries the order's address as the SNAPSHOT the wire speaks,
      // built at this edge from the checkout's picked pair.
      return await apiRequest<PurchaseOrder>('POST', '/purchase_orders/create_purchase_order', {
        user_id: user.id,
        purchase_order: {
          ...purchase_order,
          address: toAddressSnapshot(purchase_order.address, purchase_order.user_address),
        },
        user: user,
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ['purchase_orders', user?.id],
        refetchType: 'active',
      })
    },
    onSuccess: async (purchaseOrder: PurchaseOrder) => {
      const packageDetails =
        packageOptions.find((pkg) => pkg.label === purchaseOrder.shipment.package) ??
        packageOptions[0]
      const payoutDetails =
        payoutOptions.find((payout) => payout.method === purchaseOrder.payout.method) ??
        payoutOptions[0]
      try {
        await apiRequest('POST', '/emails/purchase_order_created', {
          purchaseOrder: purchaseOrder,
          spotPrices: spotPrices,
          packageDetails: packageDetails,
          payoutDetails: payoutDetails,
        })
      } catch (err) {
        console.error('Failed to send confirmation email:', err)
      }
    },
  })
}

export const useSetReviewCreated = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ purchase_order }: { purchase_order: PurchaseOrder }) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<PurchaseOrder>('POST', '/purchase_orders/create_review', {
        user_id: user.id,
        order: purchase_order,
      })
    },

    onMutate: async ({ purchase_order }) => {
      const queryKey = ['purchase_orders', user?.id]
      await queryClient.cancelQueries({ queryKey })

      const previousOrders = queryClient.getQueryData<PurchaseOrder[]>(queryKey)

      queryClient.setQueryData<PurchaseOrder[]>(queryKey, (old = []) =>
        old.map((order) =>
          order.id !== purchase_order.id
            ? order
            : {
                ...order,
                review_created: true,
              }
        )
      )

      return { previousOrders, queryKey }
    },

    onError: (_err, _vars, context) => {
      if (context?.previousOrders && context.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousOrders)
      }
    },

    onSettled: (_data, _err, _vars, context) => {
      if (context?.queryKey) {
        queryClient.invalidateQueries({ queryKey: context.queryKey, refetchType: 'active' })
      }
    },
  })
}
