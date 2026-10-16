import type {
  Action,
  AdoptAssayCandidate,
  ProfitBreakdown,
  Lot,
  OrderActivity,
  OrderPricing,
  OrderPricingSpot,
  PurityDispute,
  UserName,
} from '@dorado/contracts'

import type { OrderLotRow } from '../LotsRow'

export const ORDER_ID = '00000000-0000-4000-8000-000000000001'
export const ADMIN_ID = '00000000-0000-4000-8000-0000000000a1'
export const CUSTOMER_ID = '00000000-0000-4000-8000-0000000000c1'

export const action = (name: string, extra: Partial<Action> = {}): Action => ({
  name,
  confirm: null,
  override: null,
  ...extra,
})

const baseLot: Lot = {
  id: '',
  bullion_id: null,
  metal_id: 'Gold',
  unit: 'g',
  quantity: 1,
  pre_melt: null,
  post_melt: null,
  purity: null,
  content_snapshot: null,
  content: null,
  image_id: null,
  created_at: '2026-09-29T16:40:00Z',
  updated_at: '2026-09-29T16:40:00Z',
  created_by_id: null,
  updated_by_id: null,
  declared_unit: null,
  declared_quantity: null,
  declared_pre_melt: null,
  declared_post_melt: null,
  declared_purity: null,
  assayed_at: null,
  declared_content: null,
  premium: null,
  sales_tax_rate: null,
  confirmed_at: null,
  settled_at: null,
  settled_spot: null,
  source: null,
  line_reference: null,
}

export function orderLot(
  seat: string,
  name: string,
  lot: Partial<Lot>,
  extra: Partial<OrderLotRow> = {}
): OrderLotRow {
  const lotId = `00000000-0000-4000-8000-00000000${seat.charCodeAt(0).toString(16).padStart(4, '0')}`
  return {
    id: `10000000-0000-4000-8000-00000000${seat.charCodeAt(0).toString(16).padStart(4, '0')}`,
    order_id: ORDER_ID,
    lot_id: lotId,
    created_at: '2026-09-29T16:40:00Z',
    updated_at: '2026-09-29T16:40:00Z',
    created_by_id: null,
    updated_by_id: null,
    lot: {
      ...baseLot,
      ...lot,
      id: lotId,
      product_name: null,
      form: null,
      reference: `Lot 2481-${seat}`,
    },
    name,
    payable: null,
    price: null,
    line_total: null,
    settled: false,
    refining_order_number: null,
    source_reference: null,
    ...extra,
  }
}

export const scrapLot = orderLot(
  'A',
  '14 Karat Gold',
  { pre_melt: 142.5, post_melt: 139.22, purity: 0.563, premium: 0.92 },
  { line_total: 5102.4 }
)

export const bullionLot = orderLot(
  'D',
  '1 oz Gold American Eagle',
  {
    bullion_id: '00000000-0000-4000-8000-0000000000b1',
    unit: 'ozt',
    quantity: 2,
    premium: 0.99,
  },
  { line_total: 4701.84 }
)

export const shortLot = { ...bullionLot, id: `${bullionLot.id.slice(0, -1)}e`, stock_short: true }

export const purchasePricing: OrderPricing = {
  order_id: ORDER_ID,
  direction: 'purchase',
  spots_at: '2026-10-01T21:02:00Z',
  spots_locked: false,
  items: [],
  spots: [],
  unpriceable: [],
  scrap_total: 8412.66,
  bullion_total: 4969.93,
  items_total: 13382.59,
  shipping_charge: 24,
  payout_fee: 12.5,
  sales_tax: 0,
  credit_applied: 0,
  total: 13346.09,
  card_fee: 0,
  total_charged: 0,
  declared_value: 0,
  refunded_total: 0,
}

export const salePricing: OrderPricing = {
  ...purchasePricing,
  direction: 'sale',
  items_total: 17850,
  sales_tax: 1100.05,
  credit_applied: 300,
  total: 18674.05,
}

export const spot = (metal: string, bid: number, ask: number): OrderPricingSpot => ({
  metal_id: metal,
  state: 'live',
  last_tick_at: '2026-10-01T21:02:00Z',
  bid,
  ask,
})

export const names: UserName[] = [
  { id: ADMIN_ID, name: 'Dana Whitlock' },
  { id: CUSTOMER_ID, name: 'Marguerite Whitfield' },
]

export const activity: OrderActivity[] = [
  {
    at: '2026-10-01T21:02:00Z',
    kind: 'spots_locked',
    actor_id: ADMIN_ID,
    subject_id: ORDER_ID,
    detail: { metal_id: 'Gold' },
  },
  {
    at: '2026-09-29T16:40:00Z',
    kind: 'order_created',
    actor_id: CUSTOMER_ID,
    subject_id: ORDER_ID,
    detail: null,
  },
]

export const profit = (over: Partial<ProfitBreakdown> = {}): ProfitBreakdown => ({
  order_id: ORDER_ID,
  spots_at: '2026-10-01T21:02:00Z',
  basis: 'estimated',
  settled_lots: 1,
  total_lots: 2,
  payout: 13346.09,
  fees: { shipping: 24, payout_fee: 12.5, total: 36.5 },
  lots: [
    {
      lot_id: scrapLot.lot_id,
      reference: 'Lot 2481-A',
      metal_id: 'Gold',
      settled_at: '2026-10-02T15:00:00Z',
      settled_spot: 2411.2,
      value: 5423.08,
      estimated: false,
    },
    {
      lot_id: bullionLot.lot_id,
      reference: 'Lot 2481-D',
      metal_id: 'Gold',
      settled_at: null,
      settled_spot: null,
      value: 4997.84,
      estimated: true,
    },
  ],
  shares: [],
  parties: [],
  profit: 773.91,
  profit_party: 'dorado',
  ...over,
})

const patch = (post_melt: number, purity: number) => ({ post_melt, purity, unit: 'g' })

export const candidates: AdoptAssayCandidate[] = [
  {
    id: scrapLot.id,
    lot_id: scrapLot.lot_id,
    current: patch(139.22, 0.583),
    refiner: patch(138.9, 0.581),
    share: 1,
    proposed: patch(138.9, 0.581),
    product_name: null,
    metal_id: 'Gold',
    form: 'scrap',
    name: '14K Gold',
    reference: 'Lot 2481-A',
    line_reference: null,
  },
  {
    id: '10000000-0000-4000-8000-0000000000c3',
    lot_id: '00000000-0000-4000-8000-0000000000c3',
    current: patch(1198.6, 0.925),
    refiner: patch(371, 0.92),
    share: 0.31,
    proposed: patch(371, 0.92),
    product_name: null,
    metal_id: 'Silver',
    form: 'scrap',
    name: 'Sterling Silver',
    reference: 'Lot 2481-C',
    line_reference: 'ELM-88433',
  },
]

export const purityDispute = (over: Partial<PurityDispute> = {}): PurityDispute => ({
  id: '20000000-0000-4000-8000-000000000001',
  order_id: ORDER_ID,
  lot_id: scrapLot.lot_id,
  our_purity: 0.563,
  claimed_purity: 0.58,
  claim_source: 'their assay',
  reason: 'Customer says the clasp was weighed in with the chain.',
  resolution: null,
  resolved_at: null,
  resolved_by_id: null,
  created_at: '2026-09-30T16:00:00Z',
  updated_at: '2026-09-30T16:00:00Z',
  created_by_id: null,
  updated_by_id: null,
  ...over,
})
