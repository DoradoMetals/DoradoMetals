import type {
  AdminLot,
  AdminOrderCreate,
  AdminOrderFulfillment,
  AdminPayout,
  OrderPreviewBody,
  RefiningOrderCreate,
  SettlementType,
} from '@dorado/contracts'

export type OrderKind = 'customer_purchase' | 'customer_sale' | 'refiner_purchase' | 'refiner_sale'

export type LotForm = 'scrap' | 'bullion'

export type LotRow = {
  key: string
  form: LotForm
  metal_id: string | null
  pre_melt: string
  unit: string
  purity: string
  bullion_id: string | null
  quantity: string
  premium: string | null
}

export type Later = 'later'

export type DrawerState = {
  kind: OrderKind
  customer_id: string | null
  assigned_to_id: string | null
  refiner_id: string | null
  settlement_type: SettlementType | string | null
  location_id: string | null
  lots: LotRow[]
  lot_ids: string[]
  fulfillment: AdminOrderFulfillment | Later | null
  payout: AdminPayout | Later | null
  payment_method_id: string | null
  recipient_address_id: string | null
  ship_to_location_id: string | null
  notes: string
}

export type CreateRequest =
  | { endpoint: 'orders'; body: AdminOrderCreate }
  | { endpoint: 'refining'; body: RefiningOrderCreate }

export const ORDER_KINDS: OrderKind[] = [
  'customer_purchase',
  'customer_sale',
  'refiner_purchase',
  'refiner_sale',
]

export const isRefiner = (kind: OrderKind): boolean =>
  kind === 'refiner_purchase' || kind === 'refiner_sale'

export const directionOf = (kind: OrderKind): 'purchase' | 'sale' =>
  kind === 'customer_sale' || kind === 'refiner_sale' ? 'sale' : 'purchase'

export function emptyDrawerState(kind: OrderKind = 'customer_purchase'): DrawerState {
  return {
    kind,
    customer_id: null,
    assigned_to_id: null,
    refiner_id: null,
    settlement_type: null,
    location_id: null,
    lots: [],
    lot_ids: [],
    fulfillment: null,
    payout: null,
    payment_method_id: null,
    recipient_address_id: null,
    ship_to_location_id: null,
    notes: '',
  }
}

let rowSequence = 0

export function newLotRow(form: LotForm): LotRow {
  rowSequence += 1
  return {
    key: `row-new-${rowSequence}`,
    form,
    metal_id: null,
    pre_melt: '',
    unit: form === 'scrap' ? 'g' : '',
    purity: '',
    bullion_id: null,
    quantity: form === 'bullion' ? '1' : '',
    premium: null,
  }
}

export function copyLotRow(row: LotRow): LotRow {
  rowSequence += 1
  return { ...row, key: `row-copy-${rowSequence}` }
}

const numberOf = (text: string): number | null => {
  const trimmed = text.trim()
  if (trimmed === '') return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
}

export function parsePercent(text: string | null): number | undefined {
  if (text === null) return undefined
  const value = numberOf(text)
  if (value === null || value < 0) return undefined
  return Number((value / 100).toPrecision(12))
}

export function percentOf(fraction: number): string {
  return String(Number((fraction * 100).toPrecision(12)))
}

export function lotOf(row: LotRow): AdminLot | null {
  const premium = parsePercent(row.premium)
  const withPremium = premium === undefined ? {} : { premium }
  if (row.form === 'bullion') {
    const quantity = numberOf(row.quantity)
    if (!row.bullion_id || quantity === null || quantity <= 0) return null
    return { bullion_id: row.bullion_id, quantity, ...withPremium }
  }
  const pre_melt = numberOf(row.pre_melt)
  const purity = numberOf(row.purity)
  if (!row.metal_id || pre_melt === null || pre_melt <= 0 || purity === null || !row.unit) {
    return null
  }
  return { metal_id: row.metal_id, pre_melt, purity, unit: row.unit, ...withPremium }
}

export const completeLots = (rows: LotRow[]): AdminLot[] =>
  rows.map(lotOf).filter((lot): lot is AdminLot => lot !== null)

export const rowsComplete = (rows: LotRow[]): boolean => rows.every((row) => lotOf(row) !== null)

export const hasLots = (state: DrawerState): boolean =>
  state.kind === 'refiner_sale'
    ? state.lot_ids.length > 0
    : isRefiner(state.kind)
      ? false
      : state.lots.length > 0

export const laterAllowed = (state: DrawerState): boolean =>
  !(state.kind === 'customer_sale' && hasLots(state))

export function toPreviewBody(state: DrawerState): OrderPreviewBody | null {
  if (state.kind === 'refiner_purchase') return null
  if (state.kind === 'refiner_sale') return { kind: 'refiner_sale', lot_ids: state.lot_ids }
  if (!state.customer_id) return null
  return { kind: state.kind, user_id: state.customer_id, lots: completeLots(state.lots) }
}

function chosen<T extends object>(
  value: T | Later | null,
  required: boolean,
  what: string
): T | null {
  if (value === 'later' || value === null) {
    if (required) throw new Error(`Choose the ${what} before creating a sale with lots.`)
    return null
  }
  return value
}

export function toCreateRequest(state: DrawerState): CreateRequest {
  const assignee = state.assigned_to_id ? { assigned_to_id: state.assigned_to_id } : {}
  const notes = state.notes.trim() ? { notes: state.notes.trim() } : {}
  const required = !laterAllowed(state)

  if (isRefiner(state.kind)) {
    if (!state.refiner_id) throw new Error('Choose the refiner.')
    const lotIds =
      state.kind === 'refiner_sale' && state.lot_ids.length > 0 ? { lot_ids: state.lot_ids } : {}
    const fulfillment = chosen(state.fulfillment, required, 'fulfillment')
    return {
      endpoint: 'refining',
      body: {
        refiner_id: state.refiner_id,
        direction: state.kind === 'refiner_sale' ? 'sell' : 'buy',
        ...(state.settlement_type
          ? { settlement_type: state.settlement_type as SettlementType }
          : {}),
        ...(state.location_id ? { location_id: state.location_id } : {}),
        ...assignee,
        ...lotIds,
        ...(fulfillment ? { fulfillment } : {}),
        ...notes,
      },
    }
  }

  if (!state.customer_id) throw new Error('Choose the customer.')
  const fulfillment = chosen(state.fulfillment, required, 'fulfillment')
  const base = {
    user_id: state.customer_id,
    ...assignee,
    lots: completeLots(state.lots),
    ...(fulfillment ? { fulfillment } : {}),
  }

  if (state.kind === 'customer_purchase') {
    const payout = chosen(state.payout, false, 'payout (Transaction step)')
    return {
      endpoint: 'orders',
      body: { direction: 'purchase', ...base, ...(payout ? { payout } : {}), ...notes },
    }
  }

  if (required && (!state.payment_method_id || !state.recipient_address_id)) {
    throw new Error('Choose the payment method and billing address (Transaction step).')
  }
  return {
    endpoint: 'orders',
    body: {
      direction: 'sale',
      ...base,
      ...(state.payment_method_id ? { payment_method_id: state.payment_method_id } : {}),
      ...(state.recipient_address_id ? { recipient_address_id: state.recipient_address_id } : {}),
      ...notes,
    },
  }
}
