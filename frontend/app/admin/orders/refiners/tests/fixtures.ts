import { RefiningOrderRead, type RefiningLotView } from '@dorado/contracts'

export { desktop, stubApi } from '../../tests/fixtures'

export const ORDER = '00000000-0000-4000-8000-0000000000a1'
export const REFINER = '00000000-0000-4000-8000-0000000000a2'
export const ORG = '00000000-0000-4000-8000-0000000000a3'
export const LOCATION = '00000000-0000-4000-8000-0000000000a4'
export const PO = '00000000-0000-4000-8000-0000000000a5'
export const ADMIN = '00000000-0000-4000-8000-0000000000a6'
export const STAMP = '2026-09-05T15:07:00Z'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

export const action = (name: string, confirm: string | null = null) => ({
  name,
  confirm,
  override: null,
})

type LotOver = Partial<RefiningLotView> & { lotOver?: Partial<RefiningLotView['lot']> }

export function lot(n: number, over: LotOver = {}): RefiningLotView {
  const { lotOver, ...rest } = over
  return {
    id: id(100 + n),
    refining_order_id: ORDER,
    lot_id: id(200 + n),
    created_at: STAMP,
    updated_at: STAMP,
    created_by_id: null,
    updated_by_id: null,
    released_at: null,
    returned_at: null,
    settled_at: null,
    order_id: PO,
    order_number: 2481,
    order_direction: 'purchase',
    order_reference: 'PO-2481',
    customer_premium: 0.9,
    sources: [
      {
        id: id(300 + n),
        kind: 'batch',
        reference: `Lot 2481-${String.fromCharCode(64 + n)}`,
        content: 2.5,
        share: 1,
        order_reference: 'PO-2481',
        parents: [],
      },
    ],
    lot: {
      id: id(200 + n),
      bullion_id: null,
      metal_id: 'Gold',
      unit: 'g',
      quantity: 1,
      pre_melt: 140,
      post_melt: 139.22,
      purity: 0.583,
      content_snapshot: 2.6,
      content: 2.61,
      image_id: null,
      created_at: STAMP,
      updated_at: `2026-09-05T15:0${n}:00Z`,
      created_by_id: null,
      updated_by_id: null,
      declared_unit: null,
      declared_quantity: null,
      declared_pre_melt: null,
      declared_post_melt: null,
      declared_purity: null,
      assayed_at: null,
      declared_content: null,
      premium: 0.92,
      premium_override: false,
      sales_tax_rate: null,
      confirmed_at: null,
      settled_at: null,
      settled_spot: null,
      source: null,
      line_reference: null,
      product_name: '14K Gold',
      form: 'Scrap',
      reference: `2481-${String.fromCharCode(64 + n)}`,
      ...lotOver,
    },
    ...rest,
  }
}

export function order(over: Partial<RefiningOrderRead> = {}): RefiningOrderRead {
  return RefiningOrderRead.parse({
    id: ORDER,
    number: 'RS-2493',
    direction: 'sell',
    refiner_id: REFINER,
    assigned_to_id: null,
    sent_at: STAMP,
    settled_at: null,
    disputed_at: null,
    dispute_note: null,
    expected_settlement_on: null,
    assay_lab: 'Elemetal · Dallas',
    fee: 706,
    statement_reference: null,
    created_at: STAMP,
    updated_at: '2026-09-05T16:00:00Z',
    created_by_id: null,
    updated_by_id: null,
    location_id: LOCATION,
    cancelled_at: null,
    settlement_type: 'paid',
    state: 'Pending Assay',
    refiner: {
      id: REFINER,
      logo: null,
      created_at: null,
      updated_at: null,
      organization: { id: ORG, name: 'Elemetal Refining', email: null, phone: null, enabled: true },
    },
    lots: [
      lot(1),
      lot(2, {
        lotOver: {
          bullion_id: id(9),
          quantity: 2,
          post_melt: null,
          purity: null,
          product_name: '1 oz Gold American Eagle',
          form: 'Coin',
        },
      }),
    ],
    pool: [],
    fine_oz: [
      {
        metal_id: 'Gold',
        estimated_content: 4.81,
        settled_content: null,
        variance: null,
        pool_oz: null,
      },
    ],
    totals: {
      fee: 706,
      pool_remediation: 7.23,
      payment_charge: 20,
      shipping: 0,
      pool_oz_remediated: 0.003,
      total: 13386.77,
    },
    expected_settlement: 14120,
    orders_to_date: 12,
    linked_orders: [],
    payment: null,
    location: {
      id: LOCATION,
      name: 'Dallas',
      line_1: '1200 Regal Row',
      city: 'Dallas',
      state: 'TX',
    },
    settlement: { state: 'Pending', settled_lots: 0, lot_count: 2 },
    actions: [action('edit_lots'), action('settle'), action('cancel')],
    ...over,
  })
}

export const pricing = (orderView: RefiningOrderRead) => ({
  refining_order_id: orderView.id,
  direction: orderView.direction,
  settlement_type: orderView.settlement_type,
  spots_at: STAMP,
  lots: orderView.lots.map((row, index) => ({
    lot_id: row.lot_id,
    reference: row.lot.reference ?? '',
    product_name: row.lot.product_name,
    form: row.lot.form ?? 'Scrap',
    metal_id: row.lot.metal_id,
    line_reference: null,
    content: row.lot.content,
    quantity: row.lot.quantity,
    premium: row.lot.premium,
    settled_spot: row.lot.settled_spot,
    settled_at: row.settled_at,
    price: orderView.settlement_type === 'pooled' ? null : 5102.4 + index,
  })),
  expected_settlement: 14120,
  settled_amount: null,
  fee: 706,
  shipping: 0,
  payment_charge: 20,
  pool_remediation: 7.23,
  pool_oz_remediated: 0.003,
  total: 13386.77,
})

export const documents = (direction: 'sell' | 'buy') =>
  direction === 'sell'
    ? [
        {
          kind: 'invoice',
          name: 'Refiner Invoice',
          available: true,
          pdf_id: id(400),
          size_bytes: 49152,
          created_at: STAMP,
          created_by_id: null,
        },
        {
          kind: 'lot_manifest',
          name: 'Lot Manifest',
          available: true,
          pdf_id: id(401),
          size_bytes: 30720,
          created_at: STAMP,
          created_by_id: null,
        },
        {
          kind: 'settlement',
          name: 'Settlement',
          available: false,
          pdf_id: null,
          size_bytes: null,
          created_at: null,
          created_by_id: null,
        },
      ]
    : [
        {
          kind: 'invoice',
          name: 'Refiner Invoice',
          available: false,
          pdf_id: null,
          size_bytes: null,
          created_at: null,
          created_by_id: null,
        },
        {
          kind: 'packing_list',
          name: 'Packing List',
          available: false,
          pdf_id: null,
          size_bytes: null,
          created_at: null,
          created_by_id: null,
        },
      ]

export const employees = [
  { id: ADMIN, user_id: ADMIN, role: 'admin', enabled: true, name: 'Dana Whitlock' },
]

export const routesFor = (view: RefiningOrderRead, extra: Record<string, unknown> = {}) => ({
  [`GET /refining/orders/${view.id}`]: view,
  'POST /quotes/refining_order': pricing(view),
  [`GET /refining/orders/${view.id}/documents`]: documents(view.direction),
  [`GET /refining/orders/${view.id}/spots`]: [
    { metal_id: 'Gold', spot: 2411.2, lots: 2, settled_lots: 0 },
  ],
  'GET /employees': employees,
  ...extra,
})
