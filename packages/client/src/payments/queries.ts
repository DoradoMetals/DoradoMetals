'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  Direction,
  PaymentDetailsBank,
  PaymentDetailsPatch,
  PaymentDetailsView,
  PaymentIntentView,
  PaymentMethod,
  UpdatePaymentIntentBody,
} from '@dorado/contracts'

import { apiRequest } from '../fetch'
import { keys } from '../keys'
import { invalidateOrder } from '../orders/mutations'

const REFERENCE_STALE_TIME = 60 * 60 * 1000

export function usePaymentMethods(direction?: Direction) {
  return useQuery<PaymentMethod[]>({
    queryKey: keys.payments.methods(direction),
    queryFn: () =>
      apiRequest<PaymentMethod[]>('GET', '/payments/methods', undefined, { direction }),
    staleTime: REFERENCE_STALE_TIME,
  })
}

export function usePaymentIntentSecret(
  type: string,
  subject?: string | null,
  options: { enabled?: boolean } = {}
) {
  return useQuery<string>({
    queryKey: keys.payments.intent(type, subject),
    enabled: options.enabled ?? true,
    queryFn: () =>
      apiRequest<string>('GET', '/stripe/retrieve_payment_intent', undefined, {
        type,
        user_id: subject ?? undefined,
      }),
  })
}

export function useUpdatePaymentIntent() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdatePaymentIntentBody) =>
      apiRequest<string>('POST', '/stripe/update_payment_intent', body),
    onSuccess: (_secret, body) => {
      client.invalidateQueries({
        queryKey: keys.payments.intent(body.type ?? '', body.user_id ?? null),
      })
    },
  })
}

export function useOrderPaymentIntent(order_id: string, options: { enabled?: boolean } = {}) {
  return useQuery<PaymentIntentView>({
    queryKey: keys.payments.orderIntent(order_id),
    enabled: (options.enabled ?? true) && !!order_id,
    queryFn: () =>
      apiRequest<PaymentIntentView>('GET', '/stripe/get_sales_order_payment_intent', undefined, {
        order_id,
      }),
  })
}

export function useCancelPaymentIntent(order_id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (payment_intent_id: string) =>
      apiRequest<unknown>('POST', '/stripe/cancel_payment_intent', { payment_intent_id }),
    onSettled: () => {
      client.invalidateQueries({ queryKey: keys.payments.orderIntent(order_id) })
    },
  })
}

export function usePaymentDetails(id: string | null | undefined, enabled = true) {
  return useQuery<PaymentDetailsView>({
    queryKey: keys.payments.details(id ?? ''),
    queryFn: () => apiRequest<PaymentDetailsView>('GET', `/payments/details/${id}`),
    enabled: enabled && !!id,
  })
}

export function usePatchPaymentDetails() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; order_id: string; patch: PaymentDetailsPatch }) =>
      apiRequest<PaymentDetailsView>('PATCH', `/payments/details/${id}`, patch),
    onSettled: (_row, _err, { order_id }) => invalidateOrder(client, order_id),
  })
}

export function usePaymentDetailsBank(id: string | null | undefined, enabled: boolean) {
  return useQuery<PaymentDetailsBank>({
    queryKey: keys.payments.detailsBank(id ?? ''),
    enabled: enabled && !!id,
    queryFn: () => apiRequest<PaymentDetailsBank>('GET', `/payments/details/${id}/bank`),
    staleTime: 0,
    gcTime: 0,
  })
}

export function useOrderPaymentDetails(order_id: string | null | undefined, enabled = true) {
  return useQuery<PaymentDetailsView[]>({
    queryKey: keys.orders.paymentDetails(order_id ?? ''),
    queryFn: () => apiRequest<PaymentDetailsView[]>('GET', `/orders/${order_id}/payment-details`),
    enabled: enabled && !!order_id,
  })
}
