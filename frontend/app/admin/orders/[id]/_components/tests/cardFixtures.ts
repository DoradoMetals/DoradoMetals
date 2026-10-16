import type {
  FulfillmentView,
  OrderPaymentView,
  OrderViewPayout,
  ShipmentClaimView,
  ShipmentView,
} from '@dorado/contracts'

export const U1 = '00000000-0000-4000-8000-000000000001'
export const U2 = '00000000-0000-4000-8000-000000000002'
export const U3 = '00000000-0000-4000-8000-000000000003'

export const payment = (over: Partial<OrderPaymentView> = {}): OrderPaymentView => ({
  order_id: U1,
  number: 2481,
  direction: 'purchase',
  amount_due: 13346.09,
  transfer_id: null,
  kind: 'payout',
  rail: 'ACH',
  state: 'Not sent',
  amount: null,
  reference: null,
  failure_reason: null,
  provider: null,
  provider_ref: null,
  sent_at: null,
  completed_at: null,
  pay_to: null,
  payout_account: null,
  refining_order_id: null,
  intent_status: null,
  card_brand: null,
  card_last4: null,
  amount_received: null,
  ...over,
})

export const payout = (over: Partial<OrderViewPayout> = {}): OrderViewPayout =>
  ({
    id: U2,
    user_id: U3,
    bank_name: 'Chase',
    account_type: 'Checking',
    email_to: null,
    order_id: U1,
    method: 'ACH',
    account_holder_name: 'Marguerite Whitfield',
    account_last4: '4417',
    routing_last4: '5679',
    cost: 12.5,
    ...over,
  }) as OrderViewPayout

export const fulfillment = (
  category: 'PICKUP' | 'DIRECT' | 'DROPOFF' | 'SHIPMENT',
  status: FulfillmentView['fulfillment']['status'],
  over: Partial<FulfillmentView> = {}
): FulfillmentView =>
  ({
    fulfillment: {
      id: U1,
      method_id: U2,
      order_id: U3,
      status,
      created_by: null,
      updated_by: null,
      created_at: '2026-09-01T15:00:00Z',
      updated_at: '2026-09-01T15:00:00Z',
      created_by_id: null,
      updated_by_id: null,
      refining_order_id: null,
    },
    method: { id: U2, category, type: category, label: category },
    pickup: {
      id: U1,
      fulfillment_id: U1,
      pickup_address_id: null,
      assigned_employee_id: null,
      start_time: '2026-09-09T18:00:00Z',
      end_time: '2026-09-09T20:00:00Z',
      location_id: null,
    },
    direct: {
      id: U1,
      fulfillment_id: U1,
      location_id: null,
      assigned_employee_id: null,
      is_appointment: true,
      start_time: '2026-09-09T15:30:00Z',
      end_time: null,
    },
    dropoff: {
      id: U1,
      fulfillment_id: U1,
      refiner_id: null,
      location_id: null,
      driver_employee_id: null,
      start_time: '2026-09-10T14:00:00Z',
      end_time: null,
      departed_at: null,
      dropped_off_at: '2026-09-10T14:48:00Z',
      created_at: '2026-09-01T15:00:00Z',
      updated_at: '2026-09-01T15:00:00Z',
      created_by_id: null,
      updated_by_id: null,
    },
    shipments: [],
    parcel: null,
    scheduled_at: '2026-09-01T15:00:00Z',
    linked_order: null,
    missing: [],
    actions: {
      set_method: false,
      schedule: true,
      cancel_schedule: true,
      categories: [category],
      transitions: [],
      moves: [],
    },
    ...over,
  }) as unknown as FulfillmentView

export const shipment = (over: {
  tracking_number?: string | null
  tracking_status?: string | null
  delivered_at?: string | null
  label_type?: string | null
  reached?: number
  cancel_label?: boolean
  edit_tracking?: boolean
}): ShipmentView => {
  const stages = ['Picked Up', 'Arrived', 'In Transit', 'Out for Delivery', 'Delivered']
  const reached = over.reached ?? 0
  return {
    shipment: {
      id: U1,
      carrier_service_id: null,
      package_id: null,
      recipient_address_id: null,
      shipper_address_id: null,
      tracking_number: over.tracking_number === undefined ? '794812345678' : over.tracking_number,
      delivered_at: over.delivered_at ?? null,
      shipped_at: null,
      est_delivery: '2026-09-04T01:00:00Z',
      label_type: over.label_type === undefined ? 'PDF' : over.label_type,
      direction: 'Inbound',
      insured: true,
      declared_value: null,
      cost: null,
      actual_cost: null,
      shipping_status: null,
      pickup_type: null,
      created_at: '2026-09-01T19:10:00Z',
      pickup_date: null,
      pickup_time: null,
      additional_coverage: null,
      bill_return_to_customer: false,
    },
    service: { name: 'FedEx Ground' },
    carrier_id: U2,
    package: null,
    carrier_pickup: null,
    handoff_at: null,
    tracking: [],
    tracking_status: over.tracking_status === undefined ? 'Label Created' : over.tracking_status,
    timeline: stages.map((stage, index) => ({
      stage,
      location: index < reached ? 'Dallas, TX' : null,
      scan_time: index < reached ? '2026-09-02T06:38:00Z' : null,
      reached: index < reached,
    })),
    actions: {
      track: true,
      cancel_label: over.cancel_label ?? true,
      edit_charge: true,
      edit_tracking: over.edit_tracking ?? false,
      show_instructions: false,
    },
  } as unknown as ShipmentView
}

export const dialog = () => document.body.querySelector('[role="dialog"]') as HTMLElement | null

export const buttonsIn = (root: ParentNode) =>
  [...root.querySelectorAll('button')].map(
    (b) => b.textContent?.trim() || b.getAttribute('aria-label')
  )

export const button = (root: ParentNode, label: string) =>
  [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === label) as
    HTMLButtonElement | undefined

export const claim = (over: Partial<ShipmentClaimView> = {}): ShipmentClaimView => ({
  id: U1,
  shipment_id: U2,
  kind: 'lost',
  amount: 4701.84,
  carrier_claim_number: '7731-2290',
  status: 'Pending',
  paid_amount: null,
  note: 'Filed for a parcel scanned delivered but not received.',
  resolved_at: null,
  created_at: '2026-10-03T15:22:00Z',
  updated_at: '2026-10-03T15:22:00Z',
  created_by_id: null,
  updated_by_id: null,
  ...over,
})
