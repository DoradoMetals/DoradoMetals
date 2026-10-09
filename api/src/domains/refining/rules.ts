import { Conflict, Invalid, NotFound } from '#shared/errors.ts'
import { WeightUnit } from '@dorado/contracts'
import type {
  Action,
  Direction,
  Lot,
  LotPosition,
  OrderDocument,
  OrderRead,
  PaymentView,
  RefiningBatch,
  RefiningBatchResult,
  RefiningDocument,
  RefiningLot,
  RefiningLotPatch,
  RefiningLotView,
  RefiningOrder,
  RefiningOrderActions,
  RefiningOrderRead,
  RefiningOrderView,
  RefiningSettlementLot,
  StoredDocument,
} from '@dorado/contracts'

export function assertNamesAField(patch: object): void {
  if (Object.keys(patch).length === 0) {
    throw new Invalid('the document names no field to write')
  }
}

export function assertRefiningOrder<T>(row: T | null | undefined, id: string): asserts row is T {
  if (!row) throw new NotFound(`no refiner order ${id}`)
}

export function assertRefiningLot<T>(row: T | null | undefined, id: string): asserts row is T {
  if (!row) throw new NotFound(`no refiner lot ${id}`)
}

export function assertRefiner<T>(row: T | null | undefined, id: string): asserts row is T {
  if (!row) throw new NotFound(`no refiner ${id}`)
}

export function assertLotsExist(found: Lot[], asked: string[]): void {
  if (found.length !== asked.length) {
    const missing = asked.filter((id) => !found.some((lot) => lot.id === id))
    throw new NotFound(`no lot ${missing.join(', ')}`)
  }
}

export function assertUnassigned(taken: string[], lot_ids: string[]): void {
  if (taken.length > 0) {
    throw new Conflict(`lot ${taken.join(', ')} is already on another refiner order`)
  }
}

export function assertSaleOrder(direction: Direction | null, order_id: string): void {
  if (direction === null) throw new NotFound(`no order ${order_id}`)
  if (direction !== 'sale') {
    throw new Invalid(
      `ordering from a supplier is a sale-direction operation and this is a ${direction} order`
    )
  }
}

export function assertPurchaseOrder(direction: Direction | null, order_id: string): void {
  if (direction === null) throw new NotFound(`no order ${order_id}`)
  if (direction !== 'purchase') {
    throw new Invalid(
      `selling lots to a refiner is a purchase-direction operation and this is a ${direction} order`
    )
  }
}

export function assertOrderExists(order: OrderRead | undefined, order_id: string): void {
  if (!order) throw new NotFound(`no order ${order_id}`)
}

export function assertCancellable(order: RefiningOrder): void {
  if (order.settled_at !== null) {
    throw new Conflict(
      `refiner order ${order.number} is settled - a correction is a new pool entry, not a cancel`
    )
  }
  if (order.cancelled_at !== null) {
    throw new Conflict(`refiner order ${order.number} is already cancelled`)
  }
}

export function assertSuppliable(lot_ids: string[], order_id: string): void {
  if (lot_ids.length === 0) {
    throw new Invalid(
      `order ${order_id} holds no lots, so there is nothing to order from a supplier`
    )
  }
}

export function assertNoOpenSellOrder(open: RefiningOrder | undefined): void {
  if (open) {
    throw new Conflict(
      `refiner order ${open.number} is already open for this refiner - add the lots to it`
    )
  }
}

export function sentConfirm(order: RefiningOrderView): string | null {
  if (order.sent_at === null) return null
  return `Refiner order ${order.number} has already been sent, so its metal has left`
}

export function assertSendable(order: RefiningOrder, lots: RefiningLot[]): void {
  if (order.sent_at !== null) {
    throw new Conflict(`refiner order ${order.number} has already been sent`)
  }
  if (lots.length === 0) {
    throw new Invalid(`refiner order ${order.number} holds no lots, so there is nothing to send`)
  }
}

export function assertSettleable(order: RefiningOrder): void {
  if (order.sent_at === null) {
    throw new Invalid(`refiner order ${order.number} has not been sent, so it cannot settle`)
  }
  if (order.settled_at !== null) {
    throw new Conflict(
      `refiner order ${order.number} is settled - a correction is a new pool entry, not an edit`
    )
  }
}

export function assertWeighable(patch: RefiningLotPatch, current: Lot): void {
  const unit = patch.unit !== undefined ? patch.unit : current.unit
  const weight =
    patch.post_melt !== undefined
      ? patch.post_melt
      : patch.pre_melt !== undefined
        ? patch.pre_melt
        : (current.post_melt ?? current.pre_melt)
  const purity = patch.purity !== undefined ? patch.purity : current.purity
  if (weight === null || weight === undefined) return
  if (purity === null || purity === undefined) return
  if (!WeightUnit.safeParse(typeof unit === 'string' ? unit.toLowerCase() : unit).success) {
    throw new Invalid(
      `an assay weighed in ${unit === null || unit === undefined ? 'no unit' : `"${unit}"`} ` +
        `cannot be valued - the business quotes in ${WeightUnit.options.join(', ')}`
    )
  }
}

export function assertSettling(held: RefiningLot[], named: RefiningSettlementLot[]): void {
  const on = new Set(held.map((lot) => lot.lot_id))
  const stranger = named.find((line) => !on.has(line.lot_id))
  if (stranger) {
    throw new Invalid(`lot ${stranger.lot_id} is not on this refiner order`)
  }
}

export function settlementConfirm(lots: RefiningLotView[]): string | null {
  const unsettled = lots.filter((lot) => lot.lot.settled_at === null).length
  if (unsettled === 0) return null
  return `${unsettled} of ${lots.length} lots are not settled`
}

export function assertEveryLotSettled(written: number, named: number, id: string): void {
  if (written !== named) {
    throw new Error(
      `refiner order ${id}: ${named} lot(s) to settle, ${written} written - ` +
        `this transaction must not commit`
    )
  }
}

export function assertLotRemoved(removed: boolean, id: string): void {
  if (!removed) {
    throw new Error(`refiner lot ${id} was not removed - this transaction must not commit`)
  }
}

export function premiumConfirm(lots: RefiningLotView[]): string | null {
  const bare = lots.filter((lot) => lot.lot.premium === null).length
  if (bare === 0) return null
  return `${bare} lot(s) carry no premium, so what the refiner pays for them is unknown`
}

export function assertLockable(troy_oz: number): void {
  if (troy_oz <= 0) throw new Invalid('a lock takes metal out, so it names a positive weight')
}

export function lockConfirm(available: number, troy_oz: number): string | null {
  if (available - troy_oz >= 0) return null
  return (
    `locking ${troy_oz} draws the pool to ${available - troy_oz}, past what is available ` +
    `(${available})`
  )
}

export function assertPooledHasNoSpot(order: RefiningOrder, lots: RefiningSettlementLot[]): void {
  if (order.settlement_type !== 'pooled') return
  const spoken = lots.find((line) => line.settled_spot !== undefined && line.settled_spot !== null)
  if (spoken) {
    throw new Invalid(
      `refiner order ${order.number} is pooled - it takes the market spot automatically, so ` +
        `lot ${spoken.lot_id} cannot name its own`
    )
  }
}

export function assertOnHandNamed(skipped: LotPosition[]): void {
  if (skipped.length > 0) {
    throw new Invalid(
      `${skipped.length} named lot(s) are not on hand: ` +
        skipped.map((s) => `${s.id} (${s.position})`).join(', ')
    )
  }
}

export function assertBatchGrain(body: RefiningBatch): void {
  const hasLots = body.lot_ids !== undefined
  const hasOrders = body.order_ids !== undefined
  if (hasLots === hasOrders) {
    throw new Invalid('a batch names exactly one of lot_ids or order_ids, never both or neither')
  }
}

export function batchResult(
  order: RefiningOrderRead,
  taken: number,
  skipped: LotPosition[]
): RefiningBatchResult {
  return {
    order,
    taken,
    skipped: skipped.map((row) => ({ lot_id: row.id, position: row.position })),
  }
}

export function sendPaymentConfirm(order: RefiningOrderView): string | null {
  if (order.settled_at !== null) return null
  return `Refiner order ${order.number} has not been settled yet`
}

export function sendPaymentOverride(payment: PaymentView | null): string | null {
  if (!payment || payment.state === null) return null
  if (payment.state === 'Processing' || payment.state === 'Sent') {
    return `This refiner order already has a ${payment.state} payout`
  }
  return null
}

export function offer(
  name: string,
  confirm: string | null = null,
  override: string | null = null
): Action {
  return { name, confirm, override }
}

export function actionsFor(view: RefiningOrderView): RefiningOrderActions {
  const offered: Action[] = []
  const open = view.cancelled_at === null && view.settled_at === null
  const notCancelled = view.cancelled_at === null
  if (open) offered.push(offer('edit_lots', sentConfirm(view)))
  if (open && view.sent_at === null) offered.push(offer('send'))
  if (open && view.sent_at !== null) {
    offered.push(offer('settle', settlementConfirm(view.lots) ?? premiumConfirm(view.lots)))
  }
  if (open && view.sent_at !== null) offered.push(offer('dispute'))
  if (open) offered.push(offer('cancel'))
  if (view.settled_at !== null) offered.push(offer('lock_ounces'))
  if (notCancelled && view.direction === 'buy') {
    offered.push(offer('send_payment', sendPaymentConfirm(view), sendPaymentOverride(view.payment)))
  }
  if (notCancelled && view.direction === 'sell' && view.payment !== null) {
    const state = view.payment.state
    if (state === null || state === 'Due') offered.push(offer('request_payment'))
    if (view.payment.transfer_id !== null && state !== 'Received') {
      offered.push(offer('mark_received'))
    }
  }
  return offered
}

export function documentsFor(
  sent: boolean,
  stored: StoredDocument[],
  offered: RefiningDocument[]
): OrderDocument[] {
  return offered.map((row) => {
    const held = stored.find((file) => file.kind === row.kind) ?? null
    return {
      kind: row.kind,
      name: row.name,
      pdf_id: held?.id ?? null,
      available: row.renderable ? sent || held !== null : held !== null,
    }
  })
}
