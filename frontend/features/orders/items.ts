import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/shared/queries/axios'
import { useGetSession } from '@/features/auth/queries'
import {
  invalidateOrderReads,
  optimisticallyUpdateOrderItems,
  rollbackOrderLists,
} from '@/features/orders/invalidation'
import type { OrderItem, OrderItemPatch } from "@dorado/contracts";

// Order lines as their own resource (D87, unified form): everything under
// /orders - a line's id is already unique, and creation is order-scoped.
// Only the purchase drawer adds lines today; the server refuses a create
// against a sale. Admin-only, like every order mutation.

// THE REQUEST BODIES ARE THE CONTRACT'S (D214 item 11). `OrderItemPatch` is
// now ONE FLAT patch of orders.items' own columns - the old body nested a
// `{ scrap: {...} }` or `{ bullion: {...} }` document that SET every column
// it knew unconditionally, so a partial edit nulled its neighbour. A key
// present is written, an explicit null clears, an absent key is left alone
// (shared/db/patch.ts on the API side) - so a single-field edit here sends
// only that field.
//
// `OrderItemCreate` is a union of two members, and no metal NAME crosses the
// wire any more: a catalogue line names `bullion_id`, a scrap line names
// `metal_id` plus its own weight/purity/unit - both ids the client already
// holds off its cached reference reads (the catalogue, the spots list).

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
      return await apiRequest<OrderItem>('PATCH', `/orders/items/${order_item_id}`, patch)
    },

    // The confirmed flag is the one NON-price field here (D83); every scrap
    // and bullion figure prices the line and comes back from the refetch.
    // `reset` is gone - clearing confirmation is `confirmed: false`, sent
    // like any other value rather than a second flag meaning the same thing.
    onMutate: async ({ order_item_id, order_id, patch }) => {
      if (patch.confirmed === undefined) return { previous: undefined }
      const { confirmed } = patch
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
  item: OrderItemPatch
}

export const useCreateOrderItem = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ order_id, item }: CreateOrderItemVars) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<OrderItem>('POST', `/orders/${order_id}/items`, item)
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
