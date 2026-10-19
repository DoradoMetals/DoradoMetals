'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  Address,
  AdoptAssayBody,
  AdoptAssayProposal,
  Direction,
  FulfillmentDropoff,
  Lot,
  LotSplit,
  LotUnlinkBody,
  NoteView,
  OrderActivity,
  OrderAddressChangeBody,
  OrderCancelBody,
  OrderDocument,
  OrderList,
  OrderListSummary,
  OrderLotEditBody,
  OrderLotLine,
  OrderLotPatch,
  OrderLotView,
  OrderNoteCreateBody,
  OrderPatchBody,
  OrderPricing,
  OrderSpot,
  OrderSpotLockEvent,
  OrderSpotsPutBody,
  OrderSort,
  OrderState,
  OrderSupplyBody,
  OrderView,
  PayoutMethodsPutBody,
  ProfitBreakdown,
  PurityDispute,
  PurityDisputeOpenBody,
  PurityDisputeResolveBody,
  RefiningOrderView,
  RefundBody,
  RefundView,
  SearchHit,
  ShipmentClaimView,
  ShipmentView,
  PaymentDetailsPatch,
  PaymentDetailsView,
} from '@dorado/contracts'

import { apiRequest, apiRequestBlob, apiRequestForm, baseUrl } from '../fetch'
import { keys } from '../keys'

export type OrderListFilters = {
  direction?: Direction | null
  user_id?: string | null
  state?: OrderState[] | null
  assigned_to_id?: string | null
  has_unassigned_lots?: boolean | null
  sort?: string | null
  limit?: number | null
  offset?: number | null
  q?: string | null
}

export function useOrders(filters: OrderListFilters = {}, options: { enabled?: boolean } = {}) {
  const params = {
    direction: filters.direction ?? null,
    user_id: filters.user_id ?? null,
    state: filters.state ?? null,
    assigned_to_id: filters.assigned_to_id ?? null,
    has_unassigned_lots: filters.has_unassigned_lots ?? null,
    sort: filters.sort ?? null,
    limit: filters.limit ?? null,
    offset: filters.offset ?? null,
    q: filters.q?.trim() || null,
  }
  return useQuery<OrderList>({
    queryKey: keys.orders.list(params),
    enabled: options.enabled ?? true,
    queryFn: () => apiRequest<OrderList>('GET', '/orders', undefined, params),
  })
}

// The totals line under the Orders list title: the whole direction, never the
// list filters.
export function useOrderSummary(
  direction: Direction | null = null,
  options: { enabled?: boolean } = {}
) {
  return useQuery<OrderListSummary>({
    queryKey: keys.orders.summary(direction),
    enabled: options.enabled ?? true,
    queryFn: () => apiRequest<OrderListSummary>('GET', '/orders/summary', undefined, { direction }),
  })
}

export function useOrderSorts(options: { enabled?: boolean } = {}) {
  return useQuery<OrderSort[]>({
    queryKey: keys.orders.sorts(),
    enabled: options.enabled ?? true,
    queryFn: () => apiRequest<OrderSort[]>('GET', '/orders/sorts'),
  })
}

export function useSearch(q: string, options: { enabled?: boolean } = {}) {
  return useQuery<SearchHit[]>({
    queryKey: keys.search.hits(q),
    enabled: (options.enabled ?? true) && q.trim().length > 1,
    queryFn: () => apiRequest<SearchHit[]>('GET', '/search', undefined, { q }),
  })
}

export function useOrder(id: string, options: { enabled?: boolean } = {}) {
  return useQuery<OrderView>({
    queryKey: keys.orders.view(id),
    enabled: (options.enabled ?? true) && id.length > 0,
    queryFn: () => apiRequest<OrderView>('GET', `/orders/${id}`),
  })
}

export function useOrderSpots(id: string, options: { enabled?: boolean } = {}) {
  return useQuery<OrderSpot[]>({
    queryKey: keys.orders.spots(id),
    enabled: (options.enabled ?? true) && id.length > 0,
    queryFn: () => apiRequest<OrderSpot[]>('GET', `/orders/${id}/spots`),
  })
}

export function useOrderDocuments(id: string, options: { enabled?: boolean } = {}) {
  return useQuery<OrderDocument[]>({
    queryKey: keys.orders.documents(id),
    enabled: (options.enabled ?? true) && id.length > 0,
    queryFn: () => apiRequest<OrderDocument[]>('GET', `/orders/${id}/documents`),
  })
}

export function useOrderShipments(id: string, options: { enabled?: boolean } = {}) {
  return useQuery<ShipmentView[]>({
    queryKey: keys.orders.shipments(id),
    enabled: (options.enabled ?? true) && id.length > 0,
    queryFn: () => apiRequest<ShipmentView[]>('GET', `/orders/${id}/shipments`),
  })
}

export function useOrderDropoffs(id: string, options: { enabled?: boolean } = {}) {
  return useQuery<FulfillmentDropoff[]>({
    queryKey: keys.orders.dropoffs(id),
    enabled: (options.enabled ?? true) && id.length > 0,
    queryFn: () => apiRequest<FulfillmentDropoff[]>('GET', `/orders/${id}/dropoffs`),
  })
}

export function useProfitBreakdown(id: string, options: { enabled?: boolean } = {}) {
  return useQuery<ProfitBreakdown>({
    queryKey: keys.orders.profit(id),
    enabled: (options.enabled ?? true) && id.length > 0,
    queryFn: () =>
      apiRequest<ProfitBreakdown>('POST', '/quotes/profit_breakdown', { order_id: id }),
  })
}

export type OrderActivityPageParams = { limit?: number | null; before?: string | null }

export function useOrderActivity(
  id: string,
  page: OrderActivityPageParams = {},
  options: { enabled?: boolean } = {}
) {
  const params = { limit: page.limit ?? null, before: page.before ?? null }
  return useQuery<OrderActivity[]>({
    queryKey: keys.orders.activity(id, params),
    enabled: (options.enabled ?? true) && id.length > 0,
    queryFn: () => apiRequest<OrderActivity[]>('GET', `/orders/${id}/activity`, undefined, params),
  })
}

export const orderDocumentUrl = (id: string, kind: string): string =>
  `${baseUrl()}/orders/${id}/documents/${kind}`

export function downloadOrderDocument(id: string, kind: string): Promise<Blob> {
  return apiRequestBlob('GET', `/orders/${id}/documents/${kind}`)
}

function useOrderWrite<TVariables, TResult>(
  id: string,
  run: (variables: TVariables) => Promise<TResult>
) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: run,
    onSettled: () => {
      client.invalidateQueries({ queryKey: keys.orders.all() })
      client.invalidateQueries({ queryKey: keys.payments.view(id) })
    },
  })
}

export function usePatchOrder(id: string) {
  return useOrderWrite(id, (patch: OrderPatchBody) =>
    apiRequest<OrderView>('PATCH', `/orders/${id}`, patch)
  )
}

export function useFinalizeOrder(id: string) {
  return useOrderWrite(id, () => apiRequest<OrderView>('POST', `/orders/${id}/finalize`, {}))
}

export function useCancelOrder(id: string) {
  return useOrderWrite(id, (body: OrderCancelBody) =>
    apiRequest<OrderView>('POST', `/orders/${id}/cancel`, body)
  )
}

export function useSupplyOrder(id: string) {
  return useOrderWrite(id, (body: OrderSupplyBody) =>
    apiRequest<unknown>('POST', `/orders/${id}/supply`, body)
  )
}

export function useAddFunds(id: string) {
  return useOrderWrite(id, () => apiRequest<OrderView>('POST', `/orders/${id}/add_funds`, {}))
}

export function usePutOrderSpots(id: string) {
  return useOrderWrite(id, (body: OrderSpotsPutBody) =>
    apiRequest<OrderSpot[]>('PUT', `/orders/${id}/spots`, body)
  )
}

export function useCreateOrderLot(id: string) {
  return useOrderWrite(id, (patch: OrderLotPatch | OrderLotLine) =>
    apiRequest<OrderLotView>('POST', `/orders/${id}/lots`, patch)
  )
}

export function usePatchOrderLot(id: string) {
  return useOrderWrite(id, ({ lot_id, patch }: { lot_id: string; patch: OrderLotEditBody }) =>
    apiRequest<OrderLotView | Lot>('PATCH', `/orders/lots/${lot_id}`, patch)
  )
}

export function useUnlinkOrderLot(id: string) {
  return useOrderWrite(id, ({ lot_id, ...body }: { lot_id: string } & LotUnlinkBody) =>
    apiRequest<OrderLotView[]>('POST', `/orders/lots/${lot_id}/unlink`, body)
  )
}

export function useSplitOrderLot(id: string) {
  return useOrderWrite(id, ({ lot_id, parts }: { lot_id: string } & LotSplit) =>
    apiRequest<OrderLotView[]>('POST', `/orders/lots/${lot_id}/split`, { parts })
  )
}

export function useSendOrderDocument(id: string) {
  return useOrderWrite(id, (kind: string) =>
    apiRequest<OrderDocument>('POST', `/orders/${id}/documents/${kind}/send`, {})
  )
}

export function useImportOrderDocument(id: string) {
  return useOrderWrite(id, ({ kind, file }: { kind: string; file: File }) => {
    const form = new FormData()
    form.append('file', file, file.name)
    return apiRequestForm<OrderDocument>('POST', `/orders/${id}/documents/${kind}`, form)
  })
}

export function useCreateRefiningSale(id: string) {
  return useOrderWrite(id, (body: OrderSupplyBody) =>
    apiRequest<RefiningOrderView>('POST', `/orders/${id}/refining-sale`, body)
  )
}

export function useOrderPricing(id: string, options: { enabled?: boolean } = {}) {
  return useQuery<OrderPricing>({
    queryKey: keys.orders.pricing(id),
    enabled: (options.enabled ?? true) && id.length > 0,
    queryFn: () => apiRequest<OrderPricing>('POST', '/quotes/order', { order_id: id }),
  })
}

export function useOrderSpotLocks(id: string, options: { enabled?: boolean } = {}) {
  return useQuery<OrderSpotLockEvent[]>({
    queryKey: keys.orders.spotLocks(id),
    enabled: (options.enabled ?? true) && id.length > 0,
    queryFn: () => apiRequest<OrderSpotLockEvent[]>('GET', `/orders/${id}/spot_locks`),
  })
}

export function useOrderNotes(id: string, options: { enabled?: boolean } = {}) {
  return useQuery<NoteView[]>({
    queryKey: keys.orders.notes(id),
    enabled: (options.enabled ?? true) && id.length > 0,
    queryFn: () => apiRequest<NoteView[]>('GET', `/orders/${id}/notes`),
  })
}

export function useAddOrderNote(id: string) {
  return useOrderWrite(id, (body: OrderNoteCreateBody) =>
    apiRequest<NoteView>('POST', `/orders/${id}/notes`, body)
  )
}

export function usePutPayoutMethods(id: string) {
  return useOrderWrite(id, (body: PayoutMethodsPutBody) =>
    apiRequest<OrderView>('PUT', `/orders/${id}/payout_methods`, body)
  )
}

export function usePatchPaymentDetails(id: string) {
  return useOrderWrite(
    id,
    ({ details_id, ...patch }: { details_id: string } & PaymentDetailsPatch) =>
      apiRequest<PaymentDetailsView>('PATCH', `/payments/details/${details_id}`, patch)
  )
}

export function useOrderRefunds(id: string, options: { enabled?: boolean } = {}) {
  return useQuery<RefundView[]>({
    queryKey: keys.orders.refunds(id),
    enabled: (options.enabled ?? true) && id.length > 0,
    queryFn: () => apiRequest<RefundView[]>('GET', `/orders/${id}/refunds`),
  })
}

export function useRefundOrder(id: string) {
  return useOrderWrite(id, (body: RefundBody) =>
    apiRequest<RefundView[]>('POST', `/orders/${id}/refunds`, body)
  )
}

export function useIssueOrderRefund(id: string) {
  return useOrderWrite(id, (refund_id: string) =>
    apiRequest<RefundView[]>('POST', `/orders/${id}/refunds/${refund_id}/issue`, {})
  )
}

export function useOrderClaims(id: string, options: { enabled?: boolean } = {}) {
  return useQuery<ShipmentClaimView[]>({
    queryKey: keys.orders.claims(id),
    enabled: (options.enabled ?? true) && id.length > 0,
    queryFn: () => apiRequest<ShipmentClaimView[]>('GET', `/orders/${id}/claims`),
  })
}

export function useAdoptAssayProposal(id: string, options: { enabled?: boolean } = {}) {
  return useQuery<AdoptAssayProposal>({
    queryKey: keys.orders.adoptAssay(id),
    enabled: (options.enabled ?? true) && id.length > 0,
    queryFn: () => apiRequest<AdoptAssayProposal>('GET', `/orders/${id}/adopt_assay`),
  })
}

export function useAdoptAssay(id: string) {
  return useOrderWrite(id, (body: AdoptAssayBody) =>
    apiRequest<OrderLotView[]>('POST', `/orders/${id}/adopt_assay`, body)
  )
}

export function useOrderAddress(id: string, options: { enabled?: boolean } = {}) {
  return useQuery<Address>({
    queryKey: keys.orders.address(id),
    enabled: (options.enabled ?? true) && id.length > 0,
    queryFn: () => apiRequest<Address>('GET', `/orders/${id}/address`),
  })
}

export function useChangeOrderAddress(id: string) {
  return useOrderWrite(id, (body: OrderAddressChangeBody) =>
    apiRequest<OrderView>('POST', `/orders/${id}/address`, body)
  )
}

export function useOrderDisputes(id: string, options: { enabled?: boolean } = {}) {
  return useQuery<PurityDispute[]>({
    queryKey: keys.orders.disputes(id),
    enabled: (options.enabled ?? true) && id.length > 0,
    queryFn: () => apiRequest<PurityDispute[]>('GET', `/orders/${id}/disputes`),
  })
}

export function useOpenLotDispute(id: string) {
  return useOrderWrite(
    id,
    ({ order_lot_id, ...body }: { order_lot_id: string } & PurityDisputeOpenBody) =>
      apiRequest<PurityDispute>('POST', `/orders/lots/${order_lot_id}/disputes`, body)
  )
}

export function useResolveDispute(id: string) {
  return useOrderWrite(
    id,
    ({ dispute_id, ...body }: { dispute_id: string } & PurityDisputeResolveBody) =>
      apiRequest<PurityDispute>('PATCH', `/orders/disputes/${dispute_id}`, body)
  )
}
