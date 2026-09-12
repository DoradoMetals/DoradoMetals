import { Conflict, Invalid, NotFound } from '#shared/errors.ts'
import { WeightUnit } from '@dorado/contracts'
import { isSettled } from '#transactions/rules.ts'

import type {
  Action,
  CheckoutMissing,
  CheckoutQuote,
  Direction,
  SaleQuote,
  LotPatch,
  OrderActions,
  OrderDocument,
  OrderListItem,
  OrderLotPatch,
  OrderLotView,
  OrderSpot,
  OrderSpotsPutBody,
  OrderView,
  OrderViewFacts,
  PdfKind,
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

export function lotMoney(changes: OrderLotPatch): OrderLotPatch {
  const { premium, price, sales_tax_charged, confirmed } = changes
  return { premium, price, sales_tax_charged, confirmed }
}

export function lotFacts(changes: OrderLotPatch): LotPatch {
  const { bullion_id, metal_id, pre_melt, post_melt, purity, unit, quantity } = changes
  return { bullion_id, metal_id, pre_melt, post_melt, purity, unit, quantity }
}

export function namesAnyOf(patch: object): boolean {
  return Object.values(patch).some((value) => value !== undefined)
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

export function allLotsConfirmed(lots: Pick<OrderLotView, 'confirmed'>[]): boolean {
  return lots.length > 0 && lots.every((lot) => lot.confirmed === true)
}

export function finalizeBlockedBy(view: OrderViewFacts): string[] {
  const blocked: string[] = []
  if (view.order.direction !== 'purchase') blocked.push('this is not a purchase order')
  if (view.lots.length === 0) blocked.push('the order holds no lots')
  return blocked
}

export function finalizeConfirm(view: OrderViewFacts): string | null {
  const unconfirmed = view.lots.filter((lot) => lot.confirmed !== true).length
  const unpriced = view.lots.filter((lot) => lot.lot.content === null).length
  if (unpriced > 0) {
    return `${unpriced} of ${view.lots.length} lots have no fine weight, so they cannot be priced`
  }
  if (unconfirmed > 0) {
    return `${unconfirmed} of ${view.lots.length} lots are not confirmed`
  }
  return null
}

export function payoutConfirm(view: OrderViewFacts): string | null {
  const unsettled = view.lots.filter((lot) => lot.settled !== true).length
  if (unsettled > 0) {
    return `Refiner has not settled ${unsettled} of ${view.lots.length} lots`
  }
  if (!isFinalized(view)) return 'This order has not been finalized, so it has no settled total'
  return null
}

export function shipConfirm(view: OrderViewFacts): string | null {
  if (view.order.direction !== 'sale') return null
  if (view.state === 'Awaiting Payment') return 'The customer has not paid for this order yet'
  return null
}

export function offer(name: string, confirm: string | null = null, override: string | null = null): Action {
  return { name, confirm, override }
}

export function creditsToAccount(payoutMethod: string | null): boolean {
  return payoutMethod === 'DORADO_ACCOUNT'
}

export function isFinalized(view: OrderViewFacts): boolean {
  return view.order.spots_locked && view.totals?.total != null
}

export function actionsFor(view: OrderViewFacts): OrderActions {
  const purchase = view.order.direction === 'purchase'
  const sale = view.order.direction === 'sale'
  const cancelled = view.order.cancelled_at !== null
  const inbound = view.shipments.find((s) => s.direction === 'Inbound')
  const offered: Action[] = []

  if (purchase && !cancelled && view.address !== null) offered.push(offer('cancel'))
  if (cancelled) offered.push(offer('reopen'))
  if (finalizeBlockedBy(view).length === 0 && !view.order.spots_locked) {
    offered.push(offer('finalize', finalizeConfirm(view)))
  }
  if (purchase && view.totals?.total != null && creditsToAccount(view.payout?.method ?? null)) {
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
  if (!view.order.spots_locked) offered.push(offer('lock_spots'))
  if (view.order.spots_locked && !isFinalized(view)) offered.push(offer('unlock_spots'))

  return offered
}

export function orderViewForCustomer(view: OrderView): OrderView {
  return { ...view, order: { ...view.order, notes: null, assigned_to_id: null } }
}

export function orderListForCustomer(items: OrderListItem[]): OrderListItem[] {
  return items.map((item) => ({ ...item, notes: null, assigned_to_id: null }))
}

const FINALIZED: PdfKind[] = ['invoice', 'assay_results']

const ASSAY = { kind: 'assay_results' as PdfKind, name: 'Assay Results' }
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

export function documentsFor(
  category: string | null,
  finalized: boolean,
  stored: StoredDocument[]
): OrderDocument[] {
  return (BY_CATEGORY[category ?? 'SHIPMENT'] ?? BY_CATEGORY.SHIPMENT!).map((row) => {
    const held = stored.find((file) => file.kind === row.kind) ?? null
    return {
      kind: row.kind,
      name: row.name,
      pdf_id: held?.id ?? null,
      available: FINALIZED.includes(row.kind) ? finalized || held !== null : true,
    }
  })
}

export function assertNamesAField(patch: object): void {
  if (Object.keys(patch).length === 0) {
    throw new Invalid('the document names no field to write')
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

export function assertLot<T>(row: T | null | undefined, lot_id: string): asserts row is T {
  if (!row) throw new NotFound(`no order lot ${lot_id}`)
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
