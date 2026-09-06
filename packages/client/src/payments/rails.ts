'use client'

// THE PAYMENT RAILS, one hook per route (docs/waves/payment-rails.md).
//
// A payout and a charge are ROWS with a state - `Not sent -> Processing ->
// Sent` and `Due -> Processing -> Received` - and every transition is an
// endpoint, not a field a caller writes. So there is no `usePatchTransfer`
// here: `send`, `mark_sent`, `request` and `fail` are the four verbs, and the
// state is the server's answer to whichever one was called.
//
// `usePaymentView` is the Payment card's ONE read. It answers even when the
// order has no transfer row yet (every payment field comes back null), which
// is why the card needs nothing else to render its first state.
//
// NOTHING RENDERS THESE YET. The Payment card is a Figma frame
// (docs/design/orders-notes-2026-09-05.md section 3) and ruling 96 says a
// component that is not in Figma is not built - so this module is the API's
// typed surface waiting for the admin order page's rebuild, not dead code.
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import type {
  BankLink,
  Charge,
  ConfirmMatchBody,
  ExchangeLinkBody,
  FailTransferBody,
  InboundTransaction,
  LinkToken,
  LinkTokenBody,
  MarkSentBody,
  MatchCandidate,
  MicroDepositsBody,
  OpenChargeBody,
  OpenPayoutBody,
  PaymentView,
  PayTo,
  Payout,
  RecordWireBody,
  RequestChargeBody,
  VaultedLinkBody,
  VerifyMicroDepositsBody,
} from '@dorado/contracts'

import { apiRequest } from '../fetch'
import { keys } from '../keys'
import { invalidateOrder } from '../orders/mutations'

// Every rail write moves the order's payment state, so the card's read and the
// order itself are what a success invalidates.
const settleOrder = (client: ReturnType<typeof useQueryClient>, order_id: string) => {
  client.invalidateQueries({ queryKey: keys.payments.view(order_id) })
  invalidateOrder(client, order_id)
}

export function usePaymentView(
  order_id: string | null | undefined,
  enabled = true
): UseQueryResult<PaymentView, Error> {
  return useQuery({
    queryKey: keys.payments.view(order_id ?? ''),
    enabled: enabled && !!order_id,
    queryFn: () => apiRequest<PaymentView>('GET', `/payments/view/${order_id}`),
  })
}

// OPENING IS IDEMPOTENT: `transfers_one_live_per_order_kind` makes the create
// an upsert, so a second open answers the same row rather than a second payout.
export function useOpenPayout(): UseMutationResult<Payout, Error, OpenPayoutBody> {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: OpenPayoutBody) => apiRequest<Payout>('POST', '/payments/payouts', body),
    onSuccess: (_row, body) => settleOrder(client, body.order_id),
  })
}

export function usePayout(
  id: string | null | undefined,
  enabled = true
): UseQueryResult<Payout, Error> {
  return useQuery({
    queryKey: keys.payments.transfer(id ?? ''),
    enabled: enabled && !!id,
    queryFn: () => apiRequest<Payout>('GET', `/payments/payouts/${id}`),
  })
}

// The "Pay to" select beside Method: the customer's vaulted accounts, carrying
// no account number of any kind.
export function usePayTo(
  user_id: string | null | undefined,
  enabled = true
): UseQueryResult<PayTo[], Error> {
  return useQuery({
    queryKey: keys.payments.payTo(user_id),
    enabled: enabled && !!user_id,
    queryFn: () =>
      apiRequest<PayTo[]>('GET', '/payments/payouts/pay_to', undefined, {
        user_id: user_id ?? undefined,
      }),
  })
}

export function useSendPayout(
  order_id: string
): UseMutationResult<Payout, Error, { payout_id: string }> {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ payout_id }: { payout_id: string }) =>
      apiRequest<Payout>('POST', `/payments/payouts/${payout_id}/send`),
    onSuccess: () => settleOrder(client, order_id),
  })
}

// A WIRE SKIPS THE MIDDLE: an admin marks it Sent by hand with the reference
// the bank gave them, and that reference is the only proof there is.
export function useMarkPayoutSent(
  order_id: string
): UseMutationResult<Payout, Error, { payout_id: string } & MarkSentBody> {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ payout_id, ...body }: { payout_id: string } & MarkSentBody) =>
      apiRequest<Payout>('POST', `/payments/payouts/${payout_id}/mark_sent`, body),
    onSuccess: () => settleOrder(client, order_id),
  })
}

// A failure is a state with a reason, never a silence.
export function useFailPayout(
  order_id: string
): UseMutationResult<Payout, Error, { payout_id: string } & FailTransferBody> {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ payout_id, ...body }: { payout_id: string } & FailTransferBody) =>
      apiRequest<Payout>('POST', `/payments/payouts/${payout_id}/fail`, body),
    onSuccess: () => settleOrder(client, order_id),
  })
}

export function useOpenCharge(): UseMutationResult<Charge, Error, OpenChargeBody> {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: OpenChargeBody) => apiRequest<Charge>('POST', '/payments/charges', body),
    onSuccess: (_row, body) => settleOrder(client, body.order_id),
  })
}

export function useCharge(
  id: string | null | undefined,
  enabled = true
): UseQueryResult<Charge, Error> {
  return useQuery({
    queryKey: keys.payments.transfer(id ?? ''),
    enabled: enabled && !!id,
    queryFn: () => apiRequest<Charge>('GET', `/payments/charges/${id}`),
  })
}

export function useRequestCharge(
  order_id: string
): UseMutationResult<Charge, Error, { charge_id: string } & RequestChargeBody> {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ charge_id, ...body }: { charge_id: string } & RequestChargeBody) =>
      apiRequest<Charge>('POST', `/payments/charges/${charge_id}/request`, body),
    onSuccess: () => settleOrder(client, order_id),
  })
}

export function useFailCharge(
  order_id: string
): UseMutationResult<Charge, Error, { charge_id: string } & FailTransferBody> {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ charge_id, ...body }: { charge_id: string } & FailTransferBody) =>
      apiRequest<Charge>('POST', `/payments/charges/${charge_id}/fail`, body),
    onSuccess: () => settleOrder(client, order_id),
  })
}

export function useUnmatchedInbound(
  enabled = true
): UseQueryResult<InboundTransaction[], Error> {
  return useQuery({
    queryKey: keys.payments.unmatched(),
    enabled,
    queryFn: () => apiRequest<InboundTransaction[]>('GET', '/payments/inbound/unmatched'),
  })
}

// THE MATCHING PICKER'S PRE-SELECTION, strongest rung first. It never
// auto-confirms - the Confirm match click is `useConfirmMatch`.
export function useMatchCandidates(
  order_id: string | null | undefined,
  enabled = true
): UseQueryResult<MatchCandidate[], Error> {
  return useQuery({
    queryKey: keys.payments.candidates(order_id ?? ''),
    enabled: enabled && !!order_id,
    queryFn: () =>
      apiRequest<MatchCandidate[]>('GET', '/payments/inbound/candidates', undefined, {
        order_id: order_id ?? undefined,
      }),
  })
}

export function useRecordWire(): UseMutationResult<InboundTransaction, Error, RecordWireBody> {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: RecordWireBody) =>
      apiRequest<InboundTransaction>('POST', '/payments/inbound/wire', body),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.payments.unmatched() }),
  })
}

export function useSyncInbound(): UseMutationResult<
  { imported: number; considered: number },
  Error,
  void
> {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiRequest<{ imported: number; considered: number }>('POST', '/payments/inbound/sync'),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.payments.unmatched() }),
  })
}

export function useConfirmMatch(): UseMutationResult<
  InboundTransaction,
  Error,
  { inbound_id: string } & ConfirmMatchBody
> {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ inbound_id, ...body }: { inbound_id: string } & ConfirmMatchBody) =>
      apiRequest<InboundTransaction>('POST', `/payments/inbound/${inbound_id}/match`, body),
    onSuccess: (_row, { order_id }) => {
      client.invalidateQueries({ queryKey: keys.payments.unmatched() })
      settleOrder(client, order_id)
    },
  })
}

// Unmatching reverses both halves: the movement returns to the unmatched list
// and the order's charge returns to Due.
export function useUnmatchInbound(): UseMutationResult<
  InboundTransaction,
  Error,
  { inbound_id: string; order_id: string }
> {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ inbound_id }: { inbound_id: string; order_id: string }) =>
      apiRequest<InboundTransaction>('POST', `/payments/inbound/${inbound_id}/unmatch`),
    onSuccess: (_row, { order_id }) => {
      client.invalidateQueries({ queryKey: keys.payments.unmatched() })
      settleOrder(client, order_id)
    },
  })
}

// A BANK LINK IS A REFERENCE TO SOMEBODY ELSE'S VAULT - a Moov account id, a
// payment-method id and a last four. No routing or account number is stored,
// and the one body that carries them (`useLinkMicroDeposits`) hands them
// straight to Moov and keeps nothing.
export function useBankLinks(
  user_id?: string | null,
  enabled = true
): UseQueryResult<BankLink[], Error> {
  return useQuery({
    queryKey: keys.payments.banks(user_id),
    enabled,
    queryFn: () =>
      apiRequest<BankLink[]>('GET', '/payments/banks', undefined, {
        user_id: user_id ?? undefined,
      }),
  })
}

export function useBankLinkToken(): UseMutationResult<LinkToken, Error, LinkTokenBody> {
  return useMutation({
    mutationFn: (body: LinkTokenBody) =>
      apiRequest<LinkToken>('POST', '/payments/banks/link_token', body),
  })
}

export function useExchangeBankLink(): UseMutationResult<BankLink, Error, ExchangeLinkBody> {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: ExchangeLinkBody) =>
      apiRequest<BankLink>('POST', '/payments/banks/link', body),
    onSuccess: () => client.invalidateQueries({ queryKey: ['payments', 'banks'] }),
  })
}

export function useLinkMicroDeposits(): UseMutationResult<BankLink, Error, MicroDepositsBody> {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: MicroDepositsBody) =>
      apiRequest<BankLink>('POST', '/payments/banks/micro_deposits', body),
    onSuccess: () => client.invalidateQueries({ queryKey: ['payments', 'banks'] }),
  })
}

export function useVerifyMicroDeposits(): UseMutationResult<
  BankLink,
  Error,
  { bank_link_id: string } & VerifyMicroDepositsBody
> {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ bank_link_id, ...body }: { bank_link_id: string } & VerifyMicroDepositsBody) =>
      apiRequest<BankLink>('POST', `/payments/banks/${bank_link_id}/verify`, body),
    onSuccess: () => client.invalidateQueries({ queryKey: ['payments', 'banks'] }),
  })
}

// A refiner's account is vaulted through Moov's own vendor form; this is where
// an admin records the reference it hands back.
export function useRecordVaultedLink(): UseMutationResult<BankLink, Error, VaultedLinkBody> {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: VaultedLinkBody) =>
      apiRequest<BankLink>('POST', '/payments/banks/vaulted', body),
    onSuccess: () => client.invalidateQueries({ queryKey: ['payments', 'banks'] }),
  })
}
