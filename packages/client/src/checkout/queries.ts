import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import type {
  CheckoutItem,
  OrderView,
  Package,
  CheckoutItemPatch,
  CheckoutPatch,
  CheckoutPayoutForm,
  CheckoutView,
  Direction,
} from '@dorado/contracts'
import { apiRequest } from '../fetch'
import { keys } from '../keys'
import { ensureSession } from '../session'

export type ReadOptions = { enabled?: boolean }

export type Subject = { user_id?: string }

const scope = (direction: Direction, subject?: Subject) => ({
  direction,
  ...(subject?.user_id ? { user_id: subject.user_id } : {}),
})

export function useCheckout(
  direction: Direction,
  options: ReadOptions & Subject = {}
): UseQueryResult<CheckoutView, Error> {
  return useQuery({
    queryKey: keys.checkout.row(direction),
    enabled: options.enabled ?? true,
    queryFn: () =>
      apiRequest<CheckoutView>('GET', '/checkout', undefined, scope(direction, options)),
  })
}

export function usePatchCheckout(
  direction: Direction,
  subject?: Subject
): UseMutationResult<CheckoutView, Error, CheckoutPatch> {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (patch: CheckoutPatch) => {
      await ensureSession()
      return await apiRequest<CheckoutView>(
        'PATCH',
        '/checkout',
        { direction, ...patch },
        subject?.user_id ? { user_id: subject.user_id } : undefined
      )
    },
    onSuccess: (row) => client.setQueryData(keys.checkout.row(direction), row),
  })
}

export function useSaveCheckoutPayout(
  direction: Direction
): UseMutationResult<CheckoutView, Error, CheckoutPayoutForm> {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (form: CheckoutPayoutForm) => {
      await ensureSession()
      return await apiRequest<CheckoutView>('POST', '/checkout/payout', { direction, ...form })
    },
    onSuccess: (row) => client.setQueryData(keys.checkout.row(direction), row),
  })
}

export function useCheckoutItems(
  direction: Direction,
  options: ReadOptions & Subject = {}
): UseQueryResult<CheckoutItem[], Error> {
  return useQuery({
    queryKey: keys.checkout.items(direction, options.user_id),
    enabled: options.enabled ?? true,
    queryFn: () =>
      apiRequest<CheckoutItem[]>('GET', '/checkout/items', undefined, scope(direction, options)),
  })
}

export function useReplaceCheckoutItems(
  direction: Direction
): UseMutationResult<CheckoutItem[], Error, { items: CheckoutItemPatch[] } & Subject> {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({ items, user_id }: { items: CheckoutItemPatch[] } & Subject) => {
      await ensureSession()
      return await apiRequest<CheckoutItem[]>(
        'PUT',
        '/checkout/items',
        { items },
        scope(direction, { user_id })
      )
    },
    onSuccess: (rows, { user_id }) => {
      client.setQueryData(keys.checkout.items(direction, user_id), rows)
      if (user_id) return
      client.invalidateQueries({ queryKey: keys.checkout.row(direction) })
    },
  })
}

export function useClearCheckoutItems(
  direction: Direction
): UseMutationResult<{ removed: number }, Error, void> {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await ensureSession()
      return await apiRequest<{ removed: number }>('DELETE', '/checkout/items', undefined, {
        direction,
      })
    },
    onSuccess: () => {
      client.setQueryData(keys.checkout.items(direction), [])
      client.invalidateQueries({ queryKey: keys.checkout.row(direction) })
    },
  })
}

export function usePackages(options: ReadOptions = {}): UseQueryResult<Package[], Error> {
  return useQuery({
    queryKey: ['shipping', 'packages'],
    enabled: options.enabled ?? true,
    staleTime: 60 * 60 * 1000,
    queryFn: () => apiRequest<Package[]>('GET', '/shipping/packages'),
  })
}

export function usePlaceOrderFromCheckout(
  direction: Direction
): UseMutationResult<OrderView, Error, void> {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await ensureSession()
      const row = await apiRequest<CheckoutView>('GET', '/checkout', undefined, { direction })
      return await apiRequest<OrderView>('POST', '/orders', { checkout_id: row.id })
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: keys.checkout.row(direction) })
      client.invalidateQueries({ queryKey: keys.checkout.items(direction) })
    },
  })
}
