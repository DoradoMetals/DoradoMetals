'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ConfirmMatchBody,
  Direction,
  FailTransferBody,
  InboundTransaction,
  MarkSentBody,
  MatchCandidate,
  OpenChargeBody,
  OpenPayoutBody,
  PayTo,
  PaymentMethod,
  PaymentView,
  RecordWireBody,
  RequestChargeBody,
  Transfer,
} from '@dorado/contracts'

import { apiRequest } from '../fetch'
import { keys } from '../keys'

export function usePaymentView(orderId: string, options: { enabled?: boolean } = {}) {
  return useQuery<PaymentView>({
    queryKey: keys.payments.view(orderId),
    enabled: (options.enabled ?? true) && orderId.length > 0,
    queryFn: () => apiRequest<PaymentView>('GET', `/payments/view/${orderId}`),
  })
}

// The payee's saved accounts. Bank details are intrinsic to the counterparty,
// so this is keyed by the user, not by the order.
export function usePayTo(userId: string | null, options: { enabled?: boolean } = {}) {
  return useQuery<PayTo[]>({
    queryKey: keys.payments.payTo(userId ?? ''),
    enabled: (options.enabled ?? true) && !!userId,
    queryFn: () => apiRequest<PayTo[]>('GET', '/payments/payouts/pay_to', undefined, { user_id: userId }),
  })
}

export function usePaymentMethods(direction: Direction, options: { enabled?: boolean } = {}) {
  return useQuery<PaymentMethod[]>({
    queryKey: keys.payments.methods(direction),
    enabled: options.enabled ?? true,
    queryFn: () => apiRequest<PaymentMethod[]>('GET', '/payments/methods', undefined, { direction }),
  })
}

// The unmatched inbound transactions this order could be, best rung first.
export function useMatchCandidates(orderId: string, options: { enabled?: boolean } = {}) {
  return useQuery<MatchCandidate[]>({
    queryKey: keys.payments.candidates(orderId),
    enabled: (options.enabled ?? true) && orderId.length > 0,
    queryFn: () =>
      apiRequest<MatchCandidate[]>('GET', '/payments/inbound/candidates', undefined, {
        order_id: orderId,
      }),
  })
}

function usePaymentWrite<TVariables, TResult>(
  orderId: string,
  run: (variables: TVariables) => Promise<TResult>
) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: run,
    onSettled: () => {
      client.invalidateQueries({ queryKey: keys.payments.all() })
      client.invalidateQueries({ queryKey: keys.orders.view(orderId) })
    },
  })
}

export function useOpenPayout(orderId: string) {
  return usePaymentWrite(orderId, (body: OpenPayoutBody) =>
    apiRequest<Transfer>('POST', '/payments/payouts', body)
  )
}

export function useSendPayout(orderId: string) {
  return usePaymentWrite(orderId, (transferId: string) =>
    apiRequest<Transfer>('POST', `/payments/payouts/${transferId}/send`, {})
  )
}

export function useMarkPayoutSent(orderId: string) {
  return usePaymentWrite(
    orderId,
    ({ transfer_id, reference }: { transfer_id: string } & MarkSentBody) =>
      apiRequest<Transfer>('POST', `/payments/payouts/${transfer_id}/mark_sent`, { reference })
  )
}

export function useFailPayout(orderId: string) {
  return usePaymentWrite(
    orderId,
    ({ transfer_id, reason }: { transfer_id: string } & FailTransferBody) =>
      apiRequest<Transfer>('POST', `/payments/payouts/${transfer_id}/fail`, { reason })
  )
}

export function useOpenCharge(orderId: string) {
  return usePaymentWrite(orderId, (body: OpenChargeBody) =>
    apiRequest<Transfer>('POST', '/payments/charges', body)
  )
}

export function useRequestCharge(orderId: string) {
  return usePaymentWrite(
    orderId,
    ({ transfer_id, bank_link_id }: { transfer_id: string } & RequestChargeBody) =>
      apiRequest<Transfer>('POST', `/payments/charges/${transfer_id}/request`, { bank_link_id })
  )
}

export function useRecordWire(orderId: string) {
  return usePaymentWrite(orderId, (body: RecordWireBody) =>
    apiRequest<InboundTransaction>('POST', '/payments/inbound/wire', body)
  )
}

export function useConfirmMatch(orderId: string) {
  return usePaymentWrite(
    orderId,
    ({ inbound_id, order_id }: { inbound_id: string } & ConfirmMatchBody) =>
      apiRequest<InboundTransaction>('POST', `/payments/inbound/${inbound_id}/match`, { order_id })
  )
}
