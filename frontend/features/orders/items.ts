import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/shared/queries/axios'
import { useGetSession } from '@/features/auth/queries'
import {
  invalidateOrderReads,
  optimisticallyUpdatePurchaseOrder,
  rollbackOrderLists,
} from '@/features/orders/invalidation'
import type { Product } from '@/features/products/types'

// Order lines as their own resource (D87, unified form): everything under
// /orders - a line's id is already unique, and creation is order-scoped.
// Only the purchase drawer adds lines today; the server refuses a create
// against a sale. Admin-only, like every order mutation.

// The customer-side scrap figures and the line's premium - the same body the
// legacy update_scrap_item took, because the API dispatches it to the same
// full-write service. Two consequences the types enforce:
//   - `scrap` is the FULL scrap object with the edited fields merged over;
//     the write sets every column it knows, so a partial would null the rest.
//   - `premium` is REQUIRED, not optional: the service re-writes the line's
//     premium in the same transaction unconditionally (a scrap line prices
//     at content * spot * premium), so omitting it would write NULL.
// The assay actuals are NOT here - they are refiner data,
// features/refiners/queries.ts.
export type OrderItemScrapPatch = {
  premium: number | null
  scrap: Record<string, unknown>
}

// Both REQUIRED for the same reason: the update SETs both columns in one
// statement, so an omitted field would write NULL.
export type OrderItemBullionPatch = {
  quantity: number | null
  premium: number | null
}

export type OrderItemPatch = {
  scrap?: OrderItemScrapPatch
  bullion?: OrderItemBullionPatch
  // confirmed: true is the save; reset: true unconfirms the line.
  confirmed?: boolean
  reset?: true
}

// A scrap line seed - no id, so the server creates the scrap row. A bullion
// line is created from the catalogue Product itself, whose id it carries.
export type NewScrapItem = {
  metal: string
  pre_melt?: number
  purity?: number
  content?: number
  gross_unit?: string
  bid_premium?: number
}

export type PatchOrderItemVars = {
  order_item_id: string
  // For the caches; the URL does not carry it.
  order_id: string
  patch: OrderItemPatch
}

export const usePatchOrderItem = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ order_item_id, patch }: PatchOrderItemVars) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<unknown>('PATCH', `/orders/items/${order_item_id}`, patch)
    },

    // The confirmed flag is the one NON-price field here (D83); every scrap
    // and bullion figure prices the line and comes back from the refetch.
    onMutate: async ({ order_item_id, order_id, patch }) => {
      const confirmed = patch.reset ? false : patch.confirmed
      if (confirmed === undefined) return { previous: undefined }
      return {
        previous: await optimisticallyUpdatePurchaseOrder(queryClient, user, order_id, (order) => ({
          ...order,
          order_items: order.order_items.map((item) =>
            item.id === order_item_id ? { ...item, confirmed } : item
          ),
        })),
      }
    },

    onError: (_err, _vars, context) => {
      rollbackOrderLists(queryClient, context?.previous)
    },

    onSettled: (_data, _err, { order_id }) => {
      invalidateOrderReads(queryClient, order_id)
    },
  })
}

export type CreateOrderItemVars = {
  order_id: string
  item: NewScrapItem | Product
}

export const useCreateOrderItem = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ order_id, item }: CreateOrderItemVars) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<unknown>('POST', `/orders/${order_id}/items`, { item })
    },

    onSettled: (_data, _err, { order_id }) => {
      invalidateOrderReads(queryClient, order_id)
    },
  })
}

export type DeleteOrderItemVars = {
  order_item_id: string
  order_id: string
}

export const useDeleteOrderItem = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ order_item_id }: DeleteOrderItemVars) => {
      if (!user?.id) throw new Error('User is not authenticated')
      // The server resolves the line's scrap row itself - scrap_id is on the
      // item row, and the delete-plus-retier transaction is its to run.
      return await apiRequest<unknown>('DELETE', `/orders/items/${order_item_id}`)
    },

    // Removal is structural, not priced - the same optimism the legacy
    // delete hook wrote.
    onMutate: async ({ order_item_id, order_id }) => ({
      previous: await optimisticallyUpdatePurchaseOrder(queryClient, user, order_id, (order) => ({
        ...order,
        order_items: order.order_items.filter((item) => item.id !== order_item_id),
      })),
    }),

    onError: (_err, _vars, context) => {
      rollbackOrderLists(queryClient, context?.previous)
    },

    onSettled: (_data, _err, { order_id }) => {
      invalidateOrderReads(queryClient, order_id)
    },
  })
}
