import { Conflict, Invalid, NotFound, StaleWrite } from '#shared/errors.ts'
import { WeightUnit } from '@dorado/contracts'
import { isSettled } from '#transactions/rules.ts'
import { isBankMethod } from '#transactions/details/rules.ts'

import type {
  AdminOrderCreate,
  AdminPayout,
  CustomerOrderLotView,
  CustomerOrderView,
  Action,
  CheckoutMissing,
  CheckoutQuote,
  Direction,
  SaleQuote,
  LotPatch,
  OrderActions,
  OrderDocument,
  OrderList,
  OrderRead,
  PayoutMethodLine,
  OrderSort,
  OrderLotPatch,
  OrderLotView,
  OrderSpot,
  OrderSpotsPutBody,
  OrderView,
  OrderActionFacts,
  OrderViewFacts,
  PdfKind,
  Position,
  LotSource,
  StoredDocument,
  PaymentIntentFacts,
  PaymentMethod,
} from '@dorado/contracts'

export function chargesSalesTax(direction: Direction): boolean {
  return direction === 'sale'
}

export function assertSaleQuote(
  quote: CheckoutQuote,
  checkout_id: string
): asserts quote is SaleQuote {
  if (quote.direction !== 'sale') {
    throw new Invalid(
      `checkout ${checkout_id} is a purchase basket, so it cannot be placed as a sale`
    )
  }
}

export function declaredLot(declared: OrderLotPatch): LotPatch {
  assertDeclaredMetal(declared.metal_id)
  assertWeighable(
    declared.bullion_id ?? null,
    declared.unit,
    declared.post_melt ?? declared.pre_melt,
    declared.purity
  )
  return {
    metal_id: declared.metal_id,
    unit: declared.unit,
    pre_melt: declared.pre_melt,
    post_melt: declared.post_melt,
    purity: declared.purity,
    quantity: declared.quantity,
  }
}

export function assertWeighable(
  bullion_id: string | null | undefined,
  unit: string | null | undefined,
  weight: number | null | undefined,
  purity: number | null | undefined
): void {
  if (bullion_id) return
  if (weight === null || weight === undefined) return
  if (purity === null || purity === undefined) return
  if (!WeightUnit.safeParse(typeof unit === 'string' ? unit.toLowerCase() : unit).success) {
    throw new Invalid(
      `a lot weighed in ${unit === null || unit === undefined ? 'no unit' : `"${unit}"`} ` +
        `cannot be valued - the business quotes in ${WeightUnit.options.join(', ')}`
    )
  }
}

export function retiersAfterEdit(changes: OrderLotPatch): boolean {
  if (changes.premium !== undefined) return false
  return (
    changes.pre_melt !== undefined ||
    changes.post_melt !== undefined ||
    changes.purity !== undefined ||
    changes.unit !== undefined ||
    changes.quantity !== undefined
  )
}

export { isSettled }

export function chargeCents(post_charges_amount: number): number {
  return Math.round(post_charges_amount * 100)
}

export const STRIPE_MINIMUM_CENTS = 50

export function belowStripeMinimum(cents: number): boolean {
  return cents > 0 && cents < STRIPE_MINIMUM_CENTS
}

export function settlesAtPlacement(cents: number, alreadySucceeded: boolean): boolean {
  return cents === 0 || alreadySucceeded
}

export function attachmentVerdict(
  intent: Partial<Pick<PaymentIntentFacts, 'order_id' | 'direction' | 'payment_status'>>
): 'proceed' | 'supersede' | 'conflict' {
  if (!intent.order_id) return 'proceed'
  if (intent.direction === 'purchase') return 'conflict'
  return isSettled(intent.payment_status) ? 'conflict' : 'supersede'
}

export function repairAmountMatches(
  intent_amount: number | string | null | undefined,
  cents: number
): boolean {
  return Number(intent_amount) === cents
}

export function payoutFeeOf(methods: PaymentMethod[], payment_method_id: string | null): number {
  return Number(methods.find((m) => m.id === payment_method_id)?.flat_fee ?? 0)
}

export function allLotsConfirmed(lots: Pick<OrderLotView, 'lot'>[]): boolean {
  return lots.length > 0 && lots.every((lot) => lot.lot.confirmed_at !== null)
}

export function finalizeBlockedBy(view: OrderActionFacts): string[] {
  const blocked: string[] = []
  if (view.order.direction !== 'purchase') blocked.push('this is not a purchase order')
  if (view.lots.length === 0) blocked.push('the order holds no lots')
  return blocked
}

export function finalizeConfirm(view: OrderActionFacts): string | null {
  const unconfirmed = view.lots.filter((lot) => lot.lot.confirmed_at === null).length
  const unpriced = view.lots.filter((lot) => lot.lot.content === null).length
  if (unpriced > 0) {
    return `${unpriced} of ${view.lots.length} lots have no fine weight, so they cannot be priced`
  }
  if (unconfirmed > 0) {
    return `${unconfirmed} of ${view.lots.length} lots are not confirmed`
  }
  return null
}

export function payoutConfirm(view: OrderActionFacts): string | null {
  const unsettled = view.lots.filter((lot) => lot.settled !== true).length
  if (unsettled > 0) {
    return `Refiner has not settled ${unsettled} of ${view.lots.length} lots`
  }
  if (!isFinalized(view)) return 'This order has not been finalized, so it has no settled total'
  return null
}

export function shipConfirm(view: OrderActionFacts): string | null {
  if (view.order.direction !== 'sale') return null
  if (view.state === 'Awaiting Payment') return 'The customer has not paid for this order yet'
  return null
}

export function offer(
  name: string,
  confirm: string | null = null,
  override: string | null = null
): Action {
  return { name, confirm, override }
}

export function creditsToAccount(payoutMethod: string | null): boolean {
  return payoutMethod === 'DORADO_ACCOUNT'
}

export function paysIntoAccount(
  view: Pick<OrderActionFacts, 'payout' | 'payout_methods'>
): boolean {
  if (view.payout_methods.some((row) => row.amount !== null)) {
    return view.payout_methods.some((row) => creditsToAccount(row.method))
  }
  return creditsToAccount(view.payout?.method ?? null)
}

export function isFinalized(view: OrderActionFacts): boolean {
  return view.order.spots_locked && view.totals?.total != null
}

export function actionsFor(view: OrderActionFacts): OrderActions {
  const purchase = view.order.direction === 'purchase'
  const sale = view.order.direction === 'sale'
  const cancelled = view.order.cancelled_at !== null
  const inbound = view.shipments.find((s) => s.direction === 'Inbound')
  const offered: Action[] = []

  if (purchase && !cancelled && view.address !== null) offered.push(offer('cancel'))
  if (sale && !cancelled && saleCancelBlockedBy(view) === null) {
    offered.push(offer('cancel', saleCancelConfirm(view)))
  }
  if (view.payment.refundable > 0) offered.push(offer('refund', null, refundOverride(view)))
  if (!cancelled && view.address !== null && !parcelMoving(view)) {
    offered.push(offer('change_address', changeAddressConfirm(view)))
  }
  if (cancelled) offered.push(offer('reopen'))
  if (finalizeBlockedBy(view).length === 0 && !view.order.spots_locked) {
    offered.push(offer('finalize', finalizeConfirm(view)))
  }
  if (purchase && view.totals?.total != null && paysIntoAccount(view)) {
    offered.push(
      offer(
        'add_funds',
        null,
        view.credited ? 'This order has already been credited to the customer balance' : null
      )
    )
  }
  if (purchase && view.totals?.total != null) {
    offered.push(offer('send_payment', payoutConfirm(view)))
  }
  if (sale && view.lots.length > 0) offered.push(offer('supply'))
  if (purchase && view.lots.length > 0) {
    offered.push(
      offer(
        'refining_sale',
        isFinalized(view)
          ? null
          : `Order ${view.order.number} is not finalized, so its lots have no settled price to sell on`
      )
    )
  }
  if (purchase && inbound && !inbound.tracking_number) offered.push(offer('buy_label'))
  if (sale && view.shipments.length > 0) offered.push(offer('ship', shipConfirm(view)))
  if (view.shipments.length > 0) offered.push(offer('update_tracking'))
  if (purchase && !view.order.spots_locked) offered.push(offer('edit_lots'))
  if (purchase) offered.push(offer('assign_lots', finalizeConfirm(view)))
  if (purchase && !view.order.spots_locked)
    offered.push(offer('lock_spots', lockSpotsConfirm(view)))
  if (purchase && view.order.spots_locked && !isFinalized(view)) {
    offered.push(offer('unlock_spots', unlockSpotsConfirm(view)))
  }
  if (purchase && !cancelled && view.adopt.assayed_lots > 0) {
    offered.push(offer('adopt_assay', adoptConfirm(view)))
  }
  if (purchase && isFinalized(view) && view.state !== 'Completed') {
    offered.push(offer('add_payout_method'))
  }
  if (
    purchase &&
    !cancelled &&
    view.payout !== null &&
    !view.credited &&
    view.state !== 'Completed'
  ) {
    offered.push(offer('edit_payout_method'))
  }
  if (purchase && !cancelled && view.order.spots_locked && !isFinalized(view)) {
    offered.push(offer('edit_spots', null, editSpotsOverride(view)))
  }
  if (!cancelled && (chargeableShipment(view) || (purchase && view.payout !== null))) {
    offered.push(offer('edit_charges', null, chargedSaleOverride(view, 'a new shipping charge')))
  }
  if (addLotOpen(view)) offered.push(offer('add_lot'))
  if (!cancelled && view.lots.length > 0) {
    offered.push(
      offer(
        'remove_lots',
        purchase ? REMOVE_LOT_CONFIRM : null,
        chargedSaleOverride(view, 'removing a line')
      )
    )
  }
  if (claimOpenable(view)) offered.push(offer('open_claim'))
  if (view.cases.claims > 0) offered.push(offer('update_claim'))
  if (purchase && !cancelled && view.lots.length > view.cases.open_disputes) {
    offered.push(offer('open_dispute'))
  }
  if (view.cases.open_disputes > 0) offered.push(offer('resolve_dispute'))

  return offered
}

export function lockSpotsConfirm(view: Pick<OrderActionFacts, 'order'>): string {
  return (
    `Locking freezes today's spot bids on order ${view.order.number}. ` +
    `Its lots price on the frozen bids, not the live feed, and the lots cannot be edited until you unlock`
  )
}

export function unlockSpotsConfirm(view: Pick<OrderActionFacts, 'order'>): string {
  return (
    `Unlocking releases the frozen spot bids on order ${view.order.number}. ` +
    `Its lots price on the live feed again, so the total can move`
  )
}

export const REMOVE_LOT_CONFIRM =
  'The lot row is kept with your reason. A lot that has arrived or gone to a refiner cannot leave its order - combine it instead'

export function editSpotsOverride(view: Pick<OrderActionFacts, 'order'>): string {
  return (
    `Setting a frozen bid by hand reprices order ${view.order.number}. ` +
    `The lock log keeps your reason`
  )
}

export function chargedSaleOverride(
  view: Pick<OrderActionFacts, 'order' | 'payment'>,
  what: string
): string | null {
  if (!chargedSale(view)) return null
  return `Order ${view.order.number} has been charged, so ${what} changes money the customer paid`
}

export function chargeableShipment(view: Pick<OrderActionFacts, 'shipments'>): boolean {
  return view.shipments.some((s) => s.direction !== 'Return')
}

export function addLotOpen(view: OrderActionFacts): boolean {
  if (view.order.cancelled_at !== null) return false
  if (view.order.direction === 'purchase') return !isFinalized(view)
  if (view.order.direction === 'sale') return !parcelMoving(view)
  return false
}

export function claimOpenable(view: Pick<OrderActionFacts, 'shipments' | 'cases'>): boolean {
  return (
    view.cases.open_claims === 0 &&
    view.shipments.some((s) => s.direction !== 'Return' && s.tracking_number)
  )
}

export function parcelMoving(view: Pick<OrderActionFacts, 'shipments'>): boolean {
  return view.shipments.some(
    (s) => s.direction !== 'Return' && (s.shipped_at !== null || s.delivered_at !== null)
  )
}

export function saleCancelBlockedBy(
  view: Pick<OrderActionFacts, 'payment' | 'shipments' | 'order'>
): string | null {
  if (parcelMoving(view)) return `order ${view.order.number} has shipped, so it cannot be cancelled`
  if (view.payment.received > view.payment.refunded + view.payment.credit) {
    return (
      `order ${view.order.number} has ${view.payment.received.toFixed(2)} received ` +
      `(${view.payment.credit.toFixed(2)} of it credit the cancel gives back) and ` +
      `${view.payment.refunded.toFixed(2)} refunded - refund the money first, then cancel ` +
      `(ruling 133)`
    )
  }
  return null
}

export function saleCancelConfirm(view: Pick<OrderActionFacts, 'shipments'>): string {
  const labelled = view.shipments.some((s) => s.direction === 'Outbound' && s.tracking_number)
  return labelled
    ? 'Cancelling returns the credit to the balance, cancels the card payment and voids the label'
    : 'Cancelling returns the credit to the balance and cancels the card payment'
}

export function refundOverride(view: Pick<OrderActionFacts, 'payment'>): string {
  return `Up to ${view.payment.refundable.toFixed(2)} can go back to the customer's card`
}

export function changeAddressConfirm(view: Pick<OrderActionFacts, 'shipments'>): string | null {
  const labelled = view.shipments.find((s) => s.direction !== 'Return' && s.tracking_number)
  if (!labelled) return null
  return (
    `Voids the label and relabels. FedEx ${labelled.tracking_number} stops working and a new ` +
    `label is bought for the new address`
  )
}

export function chargedSale(view: Pick<OrderActionFacts, 'order' | 'payment'>): boolean {
  return view.order.direction === 'sale' && view.payment.charge_received
}

export function assertSaleCancellable(
  view: Pick<OrderActionFacts, 'payment' | 'shipments' | 'order'>
): void {
  if (view.order.cancelled_at !== null) {
    throw new Conflict(`order ${view.order.number} is already cancelled`)
  }
  const blocked = saleCancelBlockedBy(view)
  if (blocked) throw new Conflict(blocked)
}

export function assertReasonGiven(
  reason: string | null | undefined,
  what: string
): asserts reason is string {
  if (!reason || reason.trim().length < 10) {
    throw new Invalid(`${what} needs a written reason of at least 10 characters`)
  }
}

export function assertChargedSaleOverride(
  view: Pick<OrderActionFacts, 'order' | 'payment'>,
  override_reason: string | null | undefined,
  what: string
): void {
  if (!chargedSale(view)) return
  if (!override_reason || override_reason.trim().length < 10) {
    throw new Conflict(
      `order ${view.order.number} has been charged, so ${what} changes money the customer ` +
        `paid. It needs a written override_reason of at least 10 characters AND a session ` +
        `stepped up in the last five minutes (POST /api/account/step_up)`
    )
  }
}

export function adoptConfirm(view: Pick<OrderActionFacts, 'adopt'>): string | null {
  if (view.adopt.combining_lots < 2) return null
  return (
    `${view.adopt.combining_lots} lots were melted together at the refiner, so adopting ` +
    `the assay combines them into one lot`
  )
}

export function orderViewForCustomer(view: OrderView): CustomerOrderView {
  const { adopt: _adopt, cases: _cases, ...shared } = view
  return {
    ...shared,
    order: { ...view.order, notes: null, assigned_to_id: null },
    lots: orderLotsForCustomer(view.lots),
    shipments: view.shipments.map((shipment) =>
      shipment.direction === 'Inbound' ? { ...shipment, label: null } : shipment
    ),
    actions: [],
  }
}

export function orderLotsForCustomer(lots: OrderLotView[]): CustomerOrderLotView[] {
  return lots.map(({ source_reference: _source, ...lot }) => lot)
}

export function orderListForCustomer(list: OrderList): OrderList {
  return {
    counts: list.counts,
    items: list.items.map((item) => ({
      ...item,
      notes: null,
      assigned_to_id: null,
      actions: [],
    })),
  }
}

export function assertKnownSort(sort: string | null, offered: OrderSort[]): void {
  if (sort === null) return
  if (!offered.some((row) => row.key === sort)) {
    throw new Invalid(`"sort" is one of ${offered.map((row) => row.key).join(', ')}`)
  }
}

const FINALIZED: PdfKind[] = ['invoice', 'assay_results']

const ASSAY = { kind: 'assay_results' as PdfKind, name: 'Quote Estimate' }
const INVOICE = { kind: 'invoice' as PdfKind, name: 'Invoice' }

const BY_CATEGORY: Record<string, { kind: PdfKind; name: string }[]> = {
  SHIPMENT: [
    INVOICE,
    { kind: 'packing_list', name: 'Shipment Manifest' },
    { kind: 'return_packing_list', name: 'Return Shipment Manifest' },
    { kind: 'shipping_instructions', name: 'Shipping Instructions' },
    ASSAY,
  ],
  PICKUP: [
    INVOICE,
    { kind: 'pickup_manifest', name: 'Pickup Manifest' },
    { kind: 'pickup_instructions', name: 'Pickup Instructions' },
    ASSAY,
  ],
  DIRECT: [
    INVOICE,
    { kind: 'intake_receipt', name: 'Intake Receipt' },
    { kind: 'appointment_instructions', name: 'Appointment Instructions' },
    ASSAY,
  ],
  DROPOFF: [INVOICE, ASSAY],
}

const SALE_INVOICE = { kind: 'sales_order_invoice' as PdfKind, name: 'Sales Invoice' }

const SALE_BY_CATEGORY: Record<string, { kind: PdfKind; name: string }[]> = {
  SHIPMENT: [SALE_INVOICE, { kind: 'packing_list', name: 'Shipment Manifest' }],
  PICKUP: [SALE_INVOICE, { kind: 'pickup_manifest', name: 'Pickup Manifest' }],
  DIRECT: [
    SALE_INVOICE,
    { kind: 'intake_receipt', name: 'Intake Receipt' },
    { kind: 'appointment_instructions', name: 'Appointment Instructions' },
  ],
  DROPOFF: [SALE_INVOICE],
}

export function documentsFor(
  category: string | null,
  direction: string | null,
  finalized: boolean,
  stored: StoredDocument[]
): OrderDocument[] {
  const lists = direction === 'sale' ? SALE_BY_CATEGORY : BY_CATEGORY
  return (lists[category ?? 'SHIPMENT'] ?? lists.SHIPMENT!).map((row) => {
    const held = stored.find((file) => file.kind === row.kind) ?? null
    return {
      kind: row.kind,
      name: row.name,
      pdf_id: held?.id ?? null,
      size_bytes: held?.size_bytes ?? null,
      created_at: held?.created_at ?? null,
      created_by_id: held?.created_by_id ?? null,
      available: FINALIZED.includes(row.kind) ? finalized || held !== null : true,
    }
  })
}

export function assertNamesAField(patch: object): void {
  if (Object.keys(patch).length === 0) {
    throw new Invalid('the document names no field to write')
  }
}

export function assertFresh(
  stored: string | Date | null | undefined,
  expected: string | null | undefined,
  what: string
): void {
  if (expected === null || expected === undefined) return
  const held = stored === null || stored === undefined ? NaN : new Date(stored).getTime()
  if (held !== new Date(expected).getTime()) {
    throw new StaleWrite(
      `${what} changed since this screen loaded it (expected_updated_at ${expected}) - ` +
        `reload and make the edit again`
    )
  }
}

export function assertOrder<T>(row: T | null | undefined, order_id: string): asserts row is T {
  if (!row) throw new NotFound(`no order ${order_id}`)
}

export function assertNamesASpotField(body: OrderSpotsPutBody): void {
  if (body.lock === undefined && !body.set) {
    throw new Invalid('the document names no field to write')
  }
}

export function assertSpotsSettable(
  order: Pick<OrderRead, 'number' | 'spots_locked' | 'totals'>,
  reason: string | null | undefined
): void {
  if (!order.spots_locked) {
    throw new Invalid(
      `order ${order.number} is unlocked, so it prices at the live feed - lock its spots ` +
        `before setting a frozen bid`
    )
  }
  if (order.totals?.total != null) {
    throw new Conflict(
      `order ${order.number} is finalized, so its frozen bids are what it was paid on`
    )
  }
  if (!reason || reason.trim().length === 0) {
    throw new Invalid('setting a frozen bid by hand needs a reason, which the lock log keeps')
  }
}

export function assertLot<T>(row: T | null | undefined, lot_id: string): asserts row is T {
  if (!row) throw new NotFound(`no order lot ${lot_id}`)
}

export function assertUnlinkable(
  position: Position | undefined,
  edges: Pick<LotSource, 'kind' | 'source_lot_id'>[],
  lot_id: string
): void {
  if (position === undefined) throw new NotFound(`no lot ${lot_id}`)
  if (edges.some((edge) => edge.source_lot_id === lot_id && edge.kind === 'batch')) {
    throw new Conflict(`lot ${lot_id} is on a refiner order, so it cannot leave its order`)
  }
  if (position !== 'incoming') {
    throw new Conflict(
      `lot ${lot_id} is ${position}, so it cannot leave its order - combine it instead`
    )
  }
}

export function assertOnHand(position: Position | undefined, lot_id: string): void {
  if (position === undefined) throw new NotFound(`no lot ${lot_id}`)
  if (position !== 'on hand') {
    throw new Invalid(`lot ${lot_id} is ${position}, so it cannot be assigned to a sale`)
  }
}

export function assertCatalogueProduct<T>(
  row: T | null | undefined,
  bullion_id: string
): asserts row is T {
  if (!row) throw new NotFound(`no product ${bullion_id} to put on the order`)
}

export function assertDeclaredMetal(
  metal_id: string | null | undefined
): asserts metal_id is string {
  if (!metal_id) throw new Invalid('a declared lot needs a metal')
}

export function assertDirection(
  direction: Direction | null,
  wanted: Direction,
  operation: string
): void {
  if (direction === null) throw new Invalid(`${operation} needs an order with a direction`)
  if (direction !== wanted) {
    throw new Invalid(
      `${operation} is a ${wanted}-direction operation and this is a ${direction} order`
    )
  }
}

export function assertReturnable(order: OrderView): void {
  if (!order.address) {
    throw new Invalid(
      `order ${order.order.number} has no address snapshot, so its metal cannot be returned`
    )
  }
}

export function assertReturnService(carrier_service_id: string | null): void {
  if (!carrier_service_id) {
    throw new Invalid(
      'no carrier service is set up for returns, so this order cannot be cancelled ' +
        'with a return label - name one explicitly'
    )
  }
}

export function assertRepriced(written: unknown, order_id: string, line_id: string): void {
  if (!written) {
    throw new Error(
      `order ${order_id}: line ${line_id} vanished mid-write - its premium was not ` +
        `repriced and this transaction must not commit`
    )
  }
}

export function assertRemoved(removed: boolean, order_id: string, line_id: string): void {
  if (!removed) {
    throw new Error(
      `order ${order_id}: line ${line_id} was not removed - this ` + `transaction must not commit`
    )
  }
}

export function assertSplitEditable(
  view: Pick<OrderViewFacts, 'order' | 'totals' | 'credited'>,
  payout_state: string | null
): asserts view is typeof view & { totals: { total: number } } {
  if (view.totals?.total == null) {
    throw new Invalid(
      `order ${view.order.number} is not finalized, so it has no total to split a payout across`
    )
  }
  if (
    view.credited ||
    (payout_state !== null && !['Not sent', 'Due', 'Failed'].includes(payout_state))
  ) {
    throw new Conflict(
      `order ${view.order.number} has already paid out money, so its payout methods are fixed`
    )
  }
}

export function choosesOneMethod(methods: PayoutMethodLine[]): boolean {
  return methods.length === 1 && methods[0]?.amount == null
}

export function assertOneMethodChangeable(
  view: Pick<OrderViewFacts, 'order' | 'totals' | 'credited'>,
  payout_state: string | null
): string {
  if (view.order.cancelled_at !== null) {
    throw new Conflict(`order ${view.order.number} is cancelled, so its payout method is fixed`)
  }
  if (
    view.credited ||
    (payout_state !== null && !['Not sent', 'Due', 'Failed'].includes(payout_state))
  ) {
    throw new Conflict(
      `order ${view.order.number} has already paid out money, so its payout method is fixed`
    )
  }
  const details_id = view.totals?.payout_details_id ?? null
  if (!details_id) {
    throw new Invalid(
      `order ${view.order.number} has no payout details, so it has no payout method to change`
    )
  }
  return details_id
}

export function assertPayoutMethod<T>(
  method: T | undefined,
  method_id: string
): asserts method is T {
  if (!method) throw new NotFound(`no payout method ${method_id}`)
}

export function assertSplitShape(
  methods: PayoutMethodLine[],
  types: (string | null)[],
  gap_cents: number,
  number: string | number | null
): void {
  if (methods.length === 0) return
  if (methods.length < 2) {
    throw new Invalid(
      'a split pays by two or more methods - send an empty list to pay by the one chosen method'
    )
  }
  if (new Set(methods.map((row) => row.method_id)).size !== methods.length) {
    throw new Invalid('a split names each payout method once')
  }
  if (methods.some((row) => !(Number(row.amount) > 0))) {
    throw new Invalid('every method in a split carries an amount above zero')
  }
  if (types.some((type) => type === null)) {
    throw new NotFound('a split names a payout method that does not exist')
  }
  if (types.filter((type) => type !== 'DORADO_ACCOUNT').length > 1) {
    throw new Invalid(
      'a payout sends one transfer, so a split is the Dorado balance plus one other method ' +
        '- two transfer methods cannot both be paid'
    )
  }
  if (gap_cents !== 0) {
    throw new Invalid(
      `the split amounts must sum to order ${number}'s total - they are off by ` +
        `${(gap_cents / 100).toFixed(2)}`
    )
  }
}

export function assertCreditable(
  amount: number | null,
  number: string | number | null
): asserts amount is number {
  if (amount === null) {
    throw new Invalid(`order ${number} has no total, so there is nothing to credit`)
  }
}

export function assertPayableToAccount(
  payoutMethod: string | null,
  number: string | number | null
): void {
  if (!creditsToAccount(payoutMethod)) {
    throw new Invalid(
      `order ${number} is paid out by ${payoutMethod ?? 'no chosen method'}, ` +
        `not into a Dorado balance`
    )
  }
}

export function assertCreditOverride(
  credited: boolean,
  override_reason: string | null | undefined,
  number: string | number | null
): void {
  if (!credited) return
  if (!override_reason || override_reason.trim().length < 10) {
    throw new Conflict(
      `order ${number} has already been credited to the customer's balance. Crediting it ` +
        `again moves the money twice, so this needs a written override_reason of at least ` +
        `10 characters AND a session stepped up in the last five minutes ` +
        `(POST /api/account/step_up)`
    )
  }
}

export function assertFinalizable(view: OrderViewFacts): void {
  const blocked = finalizeBlockedBy(view)
  if (blocked.length > 0) {
    throw new Invalid(`order ${view.order.number} cannot be finalized: ${blocked.join('; ')}`)
  }
}

export function assertReopenable(view: OrderViewFacts): void {
  if (view.order.cancelled_at === null) {
    throw new Conflict(`order ${view.order.number} is not cancelled, so there is nothing to reopen`)
  }
}

export function assertClearsCancellation(next: string | null): void {
  if (next !== null) {
    throw new Invalid(
      'a PATCH may only clear cancelled_at - cancel an order with POST /api/orders/:id/cancel'
    )
  }
}

export function assertCreditCovers(balance: number | null | undefined, spending: number): void {
  if (Number(balance ?? 0) < spending) {
    throw new Conflict(
      `your Dorado balance changed while this order was being placed - ` +
        `it no longer covers the ${spending.toFixed(2)} this basket applies. Start again.`
    )
  }
}

export function assertShipmentToTrack<T>(
  shipment: T | null | undefined,
  order_id: string
): asserts shipment is T {
  if (!shipment) throw new NotFound(`order ${order_id} has no shipment to track`)
}

export function assertCheckout<T>(
  checkout: T | null | undefined,
  checkout_id: string
): asserts checkout is T {
  if (!checkout) throw new NotFound(`no checkout ${checkout_id}`)
}

export function assertPlaceable(missing: CheckoutMissing[]): void {
  if (missing.length > 0) {
    throw new Invalid(`the checkout is not complete - missing ${missing.join(', ')}`)
  }
}

export function requireAddress<T>(row: T | undefined, what: string): T {
  if (!row) throw new Invalid(`the checkout's ${what} address does not exist`)
  return row
}

export function requireFreeFulfillmentDraft<T extends { fulfillment: { order_id: string | null } }>(
  draft: T | null
): T {
  if (!draft) throw new Invalid('the checkout names a fulfillment that does not exist')
  if (draft.fulfillment.order_id) {
    throw new Conflict(
      "the checkout's fulfillment already belongs to an order - refresh and start again"
    )
  }
  return draft
}

export function assertPlacedOrder<T>(
  order: T | null | undefined,
  order_id: string
): asserts order is T {
  if (!order) throw new Error(`order ${order_id} was placed and cannot be read back`)
}

export function assertEveryMetalQuoted(
  metals: string[],
  frozen: Pick<OrderSpot, 'metal_id'>[]
): void {
  const quoted = new Set(frozen.map((row) => row.metal_id))
  for (const metal_id of new Set(metals)) {
    if (!quoted.has(metal_id)) {
      throw new Invalid(
        `there is no live quote for metal ${metal_id}, so this order cannot be priced`
      )
    }
  }
}

export function assertEveryLineCopied(written: number, expected: number, order_id: string): void {
  if (written !== expected) {
    throw new Error(
      `order ${order_id}: ${expected} basket line(s) to copy, ${written} written - ` +
        `this transaction must not commit`
    )
  }
}

export function assertTotalsWritten<T>(
  totals: T | null | undefined,
  order_id: string
): asserts totals is T {
  if (!totals) throw new Error(`order ${order_id}: its totals row was not written`)
}

export function assertAboveStripeMinimum(cents: number): void {
  if (belowStripeMinimum(cents)) {
    throw new Invalid("the amount left to charge is below Stripe's $0.50 minimum")
  }
}

export function assertOpenIntent<T>(intent: T | null | undefined): asserts intent is T {
  if (!intent) {
    throw new Invalid('this order has a card charge and the customer has no open payment intent')
  }
}

export function assertIntentLive(payment_status: string | null | undefined): void {
  if (payment_status === 'canceled') {
    throw new Conflict('that payment intent was cancelled - start checkout again')
  }
}

export function assertAttachable(verdict: ReturnType<typeof attachmentVerdict>): void {
  if (verdict === 'conflict') {
    throw new Conflict('that payment intent already belongs to an order')
  }
}

export function assertRepairable(intent: PaymentIntentFacts, cents: number): void {
  if (!repairAmountMatches(intent.amount, cents)) {
    throw new Conflict(
      `payment ${intent.payment_intent_id} was taken at a different price than this ` +
        `order totals now - contact support with that reference`
    )
  }
}

export class OrderUndecided extends Invalid {}

// An order created with lots chooses its fulfillment and its money at
// creation; with no lots both may be left for the order screen.
export function assertDecided(order: AdminOrderCreate): void {
  if (order.lots.length === 0) return
  if (!order.fulfillment) {
    throw new OrderUndecided('an order with lots chooses its fulfillment at creation')
  }
  if (order.direction === 'purchase' && !order.payout) {
    throw new OrderUndecided('a purchase with lots chooses its payout at creation')
  }
  if (order.direction === 'sale' && (!order.payment_method_id || !order.recipient_address_id)) {
    throw new OrderUndecided(
      'a sale with lots chooses its payment method and recipient address at creation'
    )
  }
}

export function assertPayoutAccountNamed(payout: AdminPayout): void {
  if (isBankMethod(payout.method) && !payout.bank_link_id) {
    throw new Invalid(`an ${payout.method} payout names a linked bank account (bank_link_id)`)
  }
}

export function requireChosen<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new OrderUndecided(`the order's ${what} is not chosen`)
  }
  return value
}

export function assertWrittenOrder(written: boolean, order_id: string): void {
  if (!written) throw new Conflict(`order ${order_id} changed under this request`)
}
