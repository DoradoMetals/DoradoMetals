import { Conflict, Invalid, NotFound } from '#shared/errors.ts'
import { WeightUnit } from '@dorado/contracts'

import type {
  CheckoutMissing,
  CheckoutQuote,
  Direction,
  SaleQuote,
  OrderActions,
  OrderItem,
  OrderItemPatch,
  OrderItemWrite,
  OrderSpot,
  OrderSpotsPutBody,
  OrderView,
  OrderViewFacts,
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

// A declared lot names its metal and its weights; its fine content is derived
// from them by `metals.fine_content` when the row is written, and is not part
// of what the caller declares (MP F1).
export function declaredLot(
  declared: OrderItemPatch
): OrderItemWrite & Pick<OrderItem, 'metal_id'> {
  assertDeclaredMetal(declared.metal_id)
  assertWeighable(
    declared.bullion_id ?? null,
    declared.unit,
    declared.post_melt ?? declared.pre_melt,
    declared.purity
  )
  return {
    ...declared,
    metal_id: declared.metal_id,
    quantity: 1,
    confirmed: false,
  }
}

// A weight the conversion does not recognise used to be worth ZERO fine ounces
// and a missing one threw a TypeError (MA F4). Both are defects in the row, so
// the lot is refused here, before anything is written. A catalogue line carries
// the product's own fine content and derives nothing, so its unit is not read.
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

export function retiersAfterEdit(changes: OrderItemPatch): boolean {
  if (changes.premium !== undefined) return false
  return (
    changes.pre_melt !== undefined ||
    changes.post_melt !== undefined ||
    changes.purity !== undefined ||
    changes.unit !== undefined ||
    changes.quantity !== undefined
  )
}

export function isSettled(payment_status: string | null | undefined): boolean {
  return payment_status === 'succeeded' || payment_status === 'processing'
}

export function chargeCents(post_charges_amount: number): number {
  return Math.round(post_charges_amount * 100)
}

export const STRIPE_MINIMUM_CENTS = 50

export function belowStripeMinimum(cents: number): boolean {
  return cents > 0 && cents < STRIPE_MINIMUM_CENTS
}

// The payment FACT, not the label: nothing is owed, or Stripe has already taken
// it. `statusAtPlacement` names the same fact for the customer, and ruling 88's
// reservation converts to a debit on it.
export function settlesAtPlacement(cents: number, alreadySucceeded: boolean): boolean {
  return cents === 0 || alreadySucceeded
}

export function statusAtPlacement(cents: number, alreadySucceeded: boolean): string {
  return settlesAtPlacement(cents, alreadySucceeded) ? 'Preparing' : 'Pending'
}

export function confirmsAtPlacement(status: string): boolean {
  return status !== 'Pending'
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

const PURCHASE_LADDER: Record<string, string[]> = {
  'In Transit': ['Received', 'Cancelled'],
  Received: ['Payment Processing', 'In Transit', 'Cancelled'],
  'Payment Processing': ['Completed', 'Received', 'Cancelled'],
  Cancelled: ['Received'],
  Completed: ['Payment Processing'],
}

const SALE_LADDER: Record<string, string[]> = {
  Pending: ['Preparing'],
  Preparing: ['In Transit', 'Pending'],
  'In Transit': ['Completed', 'Preparing'],
  Completed: ['In Transit'],
}

export function allLinesConfirmed(items: Pick<OrderItem, 'confirmed'>[]): boolean {
  return items.length > 0 && items.every((item) => item.confirmed === true)
}

export function creditsToAccount(payoutMethod: string | null): boolean {
  return payoutMethod === 'DORADO_ACCOUNT'
}

export function statusesFor(view: OrderViewFacts): string[] {
  const ladder = view.order.direction === 'sale' ? SALE_LADDER : PURCHASE_LADDER
  const offered = ladder[view.order.status ?? ''] ?? []
  return offered.filter((next) => {
    if (next === 'Payment Processing' && view.order.direction === 'purchase') {
      return allLinesConfirmed(view.items)
    }
    if (next === 'In Transit' && view.order.direction === 'sale') {
      return view.order.order_sent === true && view.order.tracking_updated === true
    }
    return true
  })
}

export function actionsFor(view: OrderViewFacts): OrderActions {
  const purchase = view.order.direction === 'purchase'
  const sale = view.order.direction === 'sale'
  const inbound = view.shipments.find((s) => s.direction === 'Inbound')
  return {
    cancel: purchase && view.address !== null,
    finalize_pricing: purchase && allLinesConfirmed(view.items),
    add_funds:
      purchase &&
      view.totals?.total != null &&
      creditsToAccount(view.payout?.method ?? null) &&
      !view.credited,
    send_to_refiner: sale && view.address !== null,
    buy_label: purchase && !!inbound && !inbound.tracking_number,
    update_tracking: view.shipments.length > 0,
    edit_lines: purchase,
    statuses: statusesFor(view),
  }
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

export function assertLine<T>(row: T | null | undefined, line_id: string): asserts row is T {
  if (!row) throw new NotFound(`no order item ${line_id}`)
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

export function assertSendable(
  order: OrderView,
  refiner_id: string,
  attachedRefinerId: string | null,
  refinerEmail: string | null | undefined
): void {
  if (!order.address) {
    throw new Invalid(
      `sales order ${order.order.number} has no address, so it cannot be sent to a refiner`
    )
  }
  if (order.order.order_sent === true && attachedRefinerId !== refiner_id) {
    throw new Conflict(
      `sales order ${order.order.number} has already been sent to a refiner. ` +
        `Sending it to a different one would leave two refiners holding it.`
    )
  }
  if (!refinerEmail) {
    throw new Invalid(
      `refiner ${refiner_id} has no email address, so sales order ` +
        `${order.order.number} cannot be sent to them`
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

// The three tests `actionsFor.add_funds` already advertises, enforced where the
// money moves (MP F4 / MI F2). Without them a second POST - an admin refresh is
// enough - credited the customer the order total again, and an order being
// WIRED was credited to a Dorado balance as well.
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

export function assertNotAlreadyCredited(credited: boolean, number: string | number | null): void {
  if (credited) {
    throw new Conflict(`order ${number} has already been credited to the customer's balance`)
  }
}

// MP F12: `actionsFor` offers finalize_pricing only when every line is
// confirmed, and the endpoint asked nothing at all - so an order could be
// priced, and its total written, from declared weights nobody had verified.
export function assertAllLinesConfirmed(
  items: Pick<OrderItem, 'confirmed'>[],
  number: string | number | null
): void {
  if (!allLinesConfirmed(items)) {
    throw new Invalid(
      `order ${number} still has unconfirmed lines, so its pricing cannot be finalised`
    )
  }
}

// MP F7 / MI F3: the quote reads the balance outside the placement
// transaction, so by the time the debit runs it can be stale. The balance is
// re-read FOR UPDATE inside the transaction and compared against what the
// quote promised to spend; a disagreement is the customer's to resolve, not
// something to silently re-clamp under a total already quoted.
export function assertCreditCovers(balance: number | null | undefined, spending: number): void {
  if (Number(balance ?? 0) < spending) {
    throw new Conflict(
      `your Dorado balance changed while this order was being placed - ` +
        `it no longer covers the ${spending.toFixed(2)} this basket applies. Start again.`
    )
  }
}

export function assertRefinerAttached(attached: boolean, order_id: string): void {
  if (!attached) {
    throw new Error(
      `sales order ${order_id}: the refiner was not attached - this ` +
        `transaction must not commit`
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
  lines: Pick<OrderItem, 'metal_id'>[],
  frozen: Pick<OrderSpot, 'metal_id'>[]
): void {
  const quoted = new Set(frozen.map((row) => row.metal_id))
  for (const metal_id of new Set(lines.map((line) => line.metal_id))) {
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
