import type {
  AdminUser,
  RefinerView,
  CustomerTimeline,
  FulfillmentMethodRead,
  FulfillmentView,
  MatchCandidate,
  OrderActions,
  OrderDocument,
  OrderLotView,
  OrderSpot,
  OrderTotals,
  OrderView,
  OrderViewPayout,
  EmployeeSummary,
  Location,
  LotView,
  RefiningSpot,
  PayTo,
  PaymentView,
  ProfitBreakdown,
  RefiningLotView,
  RefiningOrderView,
  ShipmentView,
  SmsMessage,
  SpotPrice,
} from '@dorado/contracts'

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

type ActionOverride = boolean | { confirm?: string | null; override?: string | null }

const ACTION_DEFAULTS: Record<string, boolean> = {
  cancel: true,
  reopen: false,
  finalize: true,
  add_funds: false,
  send_payment: true,
  supply: false,
  refining_sale: false,
  buy_label: false,
  update_tracking: false,
  edit_lots: true,
  assign_lots: true,
  lock_spots: true,
  unlock_spots: false,
}

export const anActions = (over: Record<string, ActionOverride> = {}): OrderActions => {
  const merged: Record<string, ActionOverride> = { ...ACTION_DEFAULTS, ...over }
  const offered: OrderActions = []
  for (const [name, value] of Object.entries(merged)) {
    if (value === false) continue
    offered.push({
      name,
      confirm: value === true ? null : (value.confirm ?? null),
      override: value === true ? null : (value.override ?? null),
    })
  }
  return offered
}

export const aTotals = (over: Partial<OrderTotals> = {}): OrderTotals =>
  ({
    id: ID(90),
    order_id: ID(1),
    total: 13346.09,
    items: 13400.0,
    shipping: 24.5,
    surcharge: 0,
    sales_tax: 0,
    funds: 0,
    created_by: null,
    updated_by: null,
    created_at: '2026-09-01T12:00:00.000Z',
    updated_at: '2026-09-01T12:00:00.000Z',
    refiner_fee: 20,
    created_by_id: null,
    updated_by_id: null,
    base_total: 13400,
    post_charges_amount: 13346.09,
    subject_to_charges_amount: 13400,
    used_funds: false,
    waive_shipping_fee: false,
    waive_payout_fee: false,
    shipping_paid: true,
    shipping_fee_actual: 22.1,
    pool_remediation: 0,
    pool_oz_deducted: 0.003,
    shipping_service: 'FedEx Priority',
    payout_fee: 12.5,
    payout_details_id: ID(70),
    ...over,
  }) satisfies OrderTotals

export const aLot = (over: Partial<OrderLotView> = {}): OrderLotView =>
  ({
    id: ID(20),
    order_id: ID(1),
    lot_id: ID(21),
    created_at: '2026-09-01T12:00:00.000Z',
    updated_at: '2026-09-01T12:00:00.000Z',
    created_by_id: null,
    updated_by_id: null,
    lot: {
      id: ID(21),
      bullion_id: null,
      metal_id: 'Gold',
      unit: 'g',
      quantity: 1,
      pre_melt: 42.1,
      post_melt: 41.8,
      purity: 0.585,
      content_snapshot: null,
      content: 0.786,
      image_id: null,
      created_at: '2026-09-01T12:00:00.000Z',
      updated_at: '2026-09-01T12:00:00.000Z',
      created_by_id: null,
      updated_by_id: null,
      declared_unit: 'g',
      declared_quantity: 1,
      declared_pre_melt: 42.1,
      declared_post_melt: 41.8,
      declared_purity: 0.585,
      assayed_at: null,
      declared_content: 0.786,
      premium: 96,
      sales_tax_rate: 0,
      confirmed_at: null,
      settled_at: null,
      settled_spot: null,
      source: null,
      product_name: null,
      form: 'Scrap',
      reference: 'Lot 2481-A',
    },
    payable: 0.786,
    price: 5102.4,
    line_total: 5102.4,
    settled: false,
    refining_order_number: null,
    ...over,
  }) satisfies OrderLotView

export const aBullionLot = (): OrderLotView =>
  aLot({
    id: ID(22),
    lot: {
      ...aLot().lot,
      id: ID(23),
      bullion_id: ID(24),
      product_name: '1 oz Gold American Eagle',
      form: 'Coin',
      pre_melt: null,
      post_melt: null,
      purity: 0.9167,
      quantity: 4,
      reference: 'Lot 1112-A',
    },
  })

export const anOrderView = (over: Partial<OrderView> = {}): OrderView =>
  ({
    order: {
      id: ID(1),
      user_id: ID(2),
      direction: 'purchase',
      number: 2481,
      notes: null,
      review_created: null,
      created_by: null,
      updated_by: null,
      created_at: '2026-09-01T12:00:00.000Z',
      updated_at: '2026-09-01T12:00:00.000Z',
      created_by_id: null,
      updated_by_id: null,
      order_sent: null,
      tracking_updated: null,
      spots_locked: false,
      assigned_to_id: ID(3),
      cancelled_at: null,
    },
    state: 'Awaiting Receipt',
    totals: aTotals(),
    lots: [aLot()],
    address: {
      id: ID(4),
      line_1: '221 Congress Ave',
      line_2: null,
      city: 'Austin',
      state: 'TX',
      country: 'US',
      zip: '78701',
      country_code: 'US',
      phone_number: '+15125550143',
      created_at: '2026-09-01T12:00:00.000Z',
      updated_at: '2026-09-01T12:00:00.000Z',
      is_valid: true,
      is_residential: false,
    },
    shipments: [],
    pickup: null,
    payout: aPayout(),
    user: {
      id: ID(2),
      name: 'Marguerite Whitfield',
      email: 'm@example.com',
      orders_to_date: 7,
    },
    credited: false,
    reference: 'PO-2481',
    actions: anActions(),
    ...over,
  }) satisfies OrderView

export function aPayout(over: Partial<OrderViewPayout> = {}): OrderViewPayout {
  return {
    id: ID(70),
    user_id: ID(2),
    bank_name: 'Chase',
    account_type: 'Checking',
    email_to: null,
    order_id: ID(1),
    method: 'ACH',
    account_holder_name: 'Marguerite Whitfield',
    account_last4: '4417',
    routing_last4: '5679',
    cost: 12.5,
    ...over,
  }
}

export const aPaymentView = (over: Partial<PaymentView> = {}): PaymentView => ({
  order_id: ID(1),
  number: 2481,
  direction: 'purchase',
  amount_due: 13346.09,
  transfer_id: ID(80),
  kind: 'payout',
  rail: 'ACH',
  state: 'Not sent',
  amount: 13346.09,
  reference: null,
  failure_reason: null,
  provider: null,
  provider_ref: null,
  sent_at: null,
  completed_at: null,
  pay_to: null,
  payout_account: null,
  refining_order_id: null,
  ...over,
})

export const aPayTo = (): PayTo => ({
  id: ID(81),
  rail: 'ACH',
  bank_name: 'Chase',
  holder_name: 'Marguerite Whitfield',
  last_four: '4417',
  status: 'verified',
  payment_method_id: null,
})

export const aCandidate = (): MatchCandidate => ({
  id: ID(82),
  source: 'plaid',
  amount: 13346.09,
  occurred_at: '2026-09-03T14:41:00.000Z',
  counterparty_name: 'M WHITFIELD',
  memo: 'PO-2481',
  account_ref: null,
  rung: 'reference',
  amount_delta: 0,
})

export const aSpot = (metal_id: string, bid: number): OrderSpot => ({
  id: ID(30),
  metal_id,
  order_id: ID(1),
  ask: bid + 8,
  bid,
  scrap_percentage: 0.9,
  bullion_percentage: 0.98,
  created_at: '2026-09-01T12:00:00.000Z',
  updated_at: '2026-09-01T12:00:00.000Z',
})

export const aLiveSpot = (id: string, bid: number): SpotPrice => ({
  id,
  ask: bid + 8,
  bid,
  percent_change: 0.4,
  dollar_change: 9.1,
  updated_at: '2026-09-01T12:00:00.000Z',
  source: 'live',
})

export const aDocument = (
  kind: OrderDocument['kind'],
  name: string,
  available: boolean
): OrderDocument => ({ kind, name, available, pdf_id: available ? ID(120) : null })

export const aMethod = (
  category: FulfillmentMethodRead['category'],
  label: string
): FulfillmentMethodRead => ({
  id: ID(category.length + 40),
  type: category,
  label,
  admin_label: label,
  category,
  direction: 'purchase',
  enabled: true,
  hidden: false,
  is_default: category === 'SHIPMENT',
  created_at: '2026-09-01T12:00:00.000Z',
  updated_at: '2026-09-01T12:00:00.000Z',
})

export const aFulfillment = (over: Partial<FulfillmentView> = {}): FulfillmentView =>
  ({
    fulfillment: {
      id: ID(50),
      method_id: ID(48),
      order_id: ID(1),
      status: 'SCHEDULED',
      created_by: null,
      updated_by: null,
      created_at: '2026-09-01T12:00:00.000Z',
      updated_at: '2026-09-01T12:00:00.000Z',
      created_by_id: null,
      updated_by_id: null,
      refining_order_id: null,
    },
    method: aMethod('SHIPMENT', 'Shipment'),
    pickup: null,
    direct: null,
    dropoff: null,
    shipments: [],
    parcel: null,
    scheduled_at: null,
    linked_order: null,
    missing: [],
    actions: {
      set_method: true,
      schedule: true,
      cancel_schedule: true,
      categories: [],
      transitions: [],
      moves: [],
    },
    ...over,
  }) satisfies FulfillmentView

export const aShipment = (
  over: Partial<ShipmentView['shipment']> = {},
  rest: Partial<ShipmentView> = {}
): ShipmentView =>
  ({
    shipment: {
      id: ID(60),
      carrier_service_id: ID(61),
      package_id: ID(62),
      recipient_address_id: ID(4),
      shipper_address_id: ID(5),
      tracking_number: '794812345678',
      delivered_at: null,
      shipped_at: null,
      est_delivery: '2026-09-03T20:00:00.000Z',
      label_type: 'PDF',
      direction: 'Inbound',
      insured: true,
      declared_value: 13400,
      cost: 24.5,
      actual_cost: 22.1,
      shipping_status: 'Label Created',
      pickup_type: null,
      created_at: '2026-09-01T12:00:00.000Z',
      pickup_date: null,
      pickup_time: null,
      additional_coverage: null,
      bill_return_to_customer: false,
      ...over,
    },
    service: null,
    carrier_id: null,
    package: null,
    carrier_pickup: null,
    handoff_at: null,
    tracking: [],
    tracking_status: 'Label Created',
    timeline: [],
    actions: {
      track: true,
      cancel_label: true,
      edit_charge: true,
      edit_tracking: true,
      show_instructions: true,
    },
    ...rest,
  }) satisfies ShipmentView

export const aProfitBreakdown = (): ProfitBreakdown => ({
  order_id: ID(1),
  spots_at: '2026-09-01T12:00:00.000Z',
  shares: [
    {
      party: 'dorado',
      category: 'total',
      metal_id: 'Gold',
      content: 0.31,
      percentage: 0.4,
      profit: 742.18,
    },
  ],
  parties: [
    {
      party: 'dorado',
      metals_profit: 742.18,
      shipping_net: -22.1,
      refiner_fee_net: -20,
      spot_net: 0,
      total_profit: 700.08,
    },
  ],
})

export const aRefiningLot = (over: Partial<RefiningLotView> = {}): RefiningLotView =>
  ({
    id: ID(100),
    refining_order_id: ID(101),
    lot_id: ID(21),
    created_at: '2026-09-01T12:00:00.000Z',
    updated_at: '2026-09-01T12:00:00.000Z',
    created_by_id: null,
    updated_by_id: null,
    lot: aLot().lot,
    sources: [],
    order_id: ID(1),
    order_number: 2481,
    order_direction: 'purchase',
    customer_premium: 5102.4,
    order_reference: 'PO-2481',
    ...over,
  }) satisfies RefiningLotView

export const aRefiningOrder = (over: Partial<RefiningOrderView> = {}): RefiningOrderView =>
  ({
    id: ID(101),
    number: 4471,
    direction: 'sell',
    refiner_id: ID(102),
    assigned_to_id: ID(3),
    sent_at: '2026-09-02T09:00:00.000Z',
    settled_at: null,
    disputed_at: null,
    expected_settlement_on: '2026-09-19T00:00:00.000Z',
    assay_lab: 'Elemetal · Dallas',
    fee: 20,
    statement_reference: null,
    created_at: '2026-09-01T12:00:00.000Z',
    updated_at: '2026-09-01T12:00:00.000Z',
    created_by_id: null,
    updated_by_id: null,
    location_id: null,
    cancelled_at: null,
    settlement_type: 'pooled',
    state: 'Pending assay',
    refiner: {
      id: ID(102),
      logo: null,
      created_at: '2026-09-01T12:00:00.000Z',
      updated_at: '2026-09-01T12:00:00.000Z',
      organization: {
        id: ID(103),
        name: 'Elemetal',
        email: 'ops@elemetal.example',
        phone: '+12145550110',
        enabled: true,
      },
    },
    lots: [aRefiningLot()],
    pool: [],
    estimated_content: 4.812,
    settled_content: null,
    variance: null,
    pool_oz: 0.003,
    totals: { fee: 20, pool_remediation: 7.24, payment_charge: 20, total: 41871.4 },
    expected_settlement: 41871.4,
    orders_to_date: 12,
    linked_orders: [],
    ...over,
  }) satisfies RefiningOrderView

export const anAdmin = (): AdminUser => ({
  id: ID(3),
  email: 'dana@doradometals.com',
  name: 'Dana Whitlock',
  image: null,
  role: 'admin',
  dorado_funds: 0,
  phone_number: '+15125550100',
  isAnonymous: false,
  phone_number_verified: true,
  deletion_requested_at: null,
  sms_consent_at: null,
  sms_consent_method: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  email_verified: true,
  assigned_to_id: null,
  notes: null,
  banned: false,
  ban_reason: null,
  ban_expires: null,
  orders_count: 0,
  open_orders_count: 0,
  last_contact: null,
  review_count: 0,
  review_rating_avg: null,
  customer_state: 'Active',
})

export const aMessage = (over: Partial<SmsMessage> = {}): SmsMessage => ({
  id: ID(110),
  direction: 'inbound',
  provider: 'twilio',
  provider_sid: 'SM1',
  from_number: '+15125550143',
  to_number: '+15125550100',
  body: 'Has my gold arrived?',
  media: null,
  status: 'received',
  error_code: null,
  user_id: ID(2),
  received_at: '2026-09-03T13:00:00.000Z',
  sent_at: null,
  created_at: '2026-09-03T13:00:00.000Z',
  updated_at: '2026-09-03T13:00:00.000Z',
  created_by_id: null,
  updated_by_id: null,
  read_at: null,
  ...over,
})

export const aTimelineCall = (over: Partial<CustomerTimeline> = {}): CustomerTimeline => ({
  id: ID(111),
  kind: 'call',
  at: '2026-09-03T13:20:00.000Z',
  direction: 'outbound',
  summary: '2m 14s',
  status: 'completed',
  call_kind: 'Outgoing',
  duration_seconds: 134,
  recording_url: null,
  actor_id: null,
  actor_name: null,
  ...over,
})

export const aRefiner = (): RefinerView => aRefiningOrder().refiner!

export const aLocation = (over: Partial<Location> = {}): Location => ({
  id: ID(130),
  address_id: ID(131),
  image_id: null,
  organization_id: ID(132),
  name: 'Austin office',
  type: 'office',
  enabled: true,
  label_company_name: 'Dorado Metals',
  label_phone_number: '+15125550100',
  default_return: true,
  carrier_location_code: null,
  ...over,
})

export const anEmployee = (over: Partial<EmployeeSummary> = {}): EmployeeSummary => ({
  id: ID(140),
  user_id: ID(3),
  role: 'admin',
  enabled: true,
  name: 'Dana Whitlock',
  ...over,
})

export const aFoundLot = (over: Partial<LotView> = {}): LotView => ({
  ...aLot().lot,
  id: ID(150),
  reference: 'Lot 2493-B',
  ...over,
})

export const aRefiningSpot = (metal_id: string, spot: number): RefiningSpot => ({
  metal_id,
  spot,
  lots: 1,
  settled_lots: 0,
})
