import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/shared/queries/axios'
import { useGetSession } from '@/features/auth/queries'
import {
  invalidateOrderReads,
  optimisticallyUpdateOrderItems,
  rollbackOrderLists,
} from '@/features/orders/invalidation'
import type { OrderItem, OrderItemPatch } from '@dorado/contracts'
import type { Product } from '@/features/products/types'

// Order lines as their own resource (D87, unified form): everything under
// /orders - a line's id is already unique, and creation is order-scoped.
// Only the purchase drawer adds lines today; the server refuses a create
// against a sale. Admin-only, like every order mutation.

// THE REQUEST BODIES ARE THE CONTRACT'S NOW (phase 3, A3). The remainder this
// file declared has been taken. These three were written here AND in
// api/features/orders/items/service.ts, and THIS side was the accurate one:
// the API typed `scrap` as a bare `Record<string, unknown>` when it is
// `{ premium, scrap }` with both members required, because updateScrapItem
// writes every column it knows and updateBullion's statement is
// `SET quantity = $1, premium = $2` unconditionally - a partial document does
// not leave the rest alone, it NULLS it. The contract requires what the
// statements write, and the API now refuses a partial by name instead of
// nulling a bullion line's quantity.
//
// `confirmed` and `reset` are both `true`-only there as well, which is what
// the dispatch always did: `confirmed: false` matched no branch and answered
// 200 having written nothing.
//
// The assay actuals are NOT here - they are refiner data,
// features/refiners/queries.ts.
//
// The mutation VARIABLE bundles beside them (`Patch*Vars`) are a different
// thing and are not exported: an id plus a patch plus whatever the cache
// needs is react-query plumbing, used in one file, and never crosses the wire
// as a unit.
export type {
  OrderItemPatch,
  OrderItemScrapPatch,
  OrderItemBullionPatch,
} from '@dorado/contracts'

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

type PatchOrderItemVars = {
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
        previous: await optimisticallyUpdateOrderItems(queryClient, order_id, (items) =>
          (items as OrderItem[]).map((item) =>
            item.id === order_item_id ? { ...item, confirmed } : item
          )
        ),
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

type CreateOrderItemVars = {
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

type DeleteOrderItemVars = {
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
      previous: await optimisticallyUpdateOrderItems(queryClient, order_id, (items) =>
        (items as OrderItem[]).filter((item) => item.id !== order_item_id)
      ),
    }),

    onError: (_err, _vars, context) => {
      rollbackOrderLists(queryClient, context?.previous)
    },

    onSettled: (_data, _err, { order_id }) => {
      invalidateOrderReads(queryClient, order_id)
    },
  })
}
