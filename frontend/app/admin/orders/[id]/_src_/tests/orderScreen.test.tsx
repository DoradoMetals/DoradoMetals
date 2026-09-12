import { describe, expect, test, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

import {
  aBullionLot,
  aDocument,
  aFulfillment,
  aLiveSpot,
  aLocation,
  aMessage,
  aMethod,
  aPayTo,
  aPaymentView,
  aProfitBreakdown,
  aShipment,
  aSpot,
  aRefiner,
  aTimelineCall,
  anActions,
  anAdmin,
  anEmployee,
  anOrderView,
} from '@/app/admin/_src_/orders/tests/fixtures'

const query = <T,>(data: T) => ({ data, isPending: false, isError: false })
const mutation = () => ({ mutate: vi.fn(), isPending: false })

const state = {
  order: anOrderView(),
  fulfillment: aFulfillment() as ReturnType<typeof aFulfillment> | null,
  shipments: [] as ReturnType<typeof aShipment>[],
  payment: aPaymentView(),
}

vi.mock('@dorado/client', () => ({
  useOrder: () => query(state.order),
  useOrderSpots: () => query([aSpot('Gold', 2411.2)]),
  useLiveSpots: () => query([aLiveSpot('Gold', 2450)]),
  useOrderDocuments: () =>
    query([
      aDocument('invoice', 'Invoice', false),
      aDocument('packing_list', 'Packing List', true),
    ]),
  useOrderFulfillment: () => query(state.fulfillment),
  useOrderShipments: () => query(state.shipments),
  usePaymentView: () => query(state.payment),
  useAdmins: () => query([anAdmin()]),
  useAdminUser: () => query(anAdmin()),
  useCustomerTimeline: () => query([aTimelineCall()]),
  useConversation: () => query([aMessage()]),
  usePayTo: () => query([aPayTo()]),
  useMatchCandidates: () => query([]),
  useProfitBreakdown: () => query(aProfitBreakdown()),
  useFulfillmentMethods: () => query([aMethod('SHIPMENT', 'Shipment')]),
  useCarrierServices: () => query([]),
  usePackages: () => query([]),
  useHandoffs: () => query([]),
  useLocations: () => query([aLocation()]),
  useEmployees: () => query([anEmployee()]),
  useRefiners: () => query([aRefiner()]),
  usePatchOrder: mutation,
  useFinalizeOrder: mutation,
  useReopenOrder: mutation,
  usePutOrderSpots: mutation,
  useCreateOrderLot: mutation,
  usePatchOrderLot: mutation,
  useDeleteOrderLot: mutation,
  useOpenPayout: mutation,
  useSendPayout: mutation,
  useOpenCharge: mutation,
  useConfirmMatch: mutation,
  useSetFulfillmentMethod: mutation,
  usePatchFulfillment: mutation,
  useSchedulePickup: mutation,
  useScheduleDirect: mutation,
  useSetFulfillmentStatus: mutation,
  useCancelSchedule: mutation,
  usePatchShipment: mutation,
  useCancelLabel: mutation,
  useCancelOrder: mutation,
  useCreateRefiningOrder: mutation,
  useCreateRefiningSale: mutation,
  useCreateFulfillment: mutation,
  useScheduleDropoff: mutation,
  useSendOrderDocument: mutation,
  useImportOrderDocument: mutation,
  useSendSms: mutation,
}))

const { AdminOrderScreen } = await import('../AdminOrderScreen')

beforeEach(() => {
  state.order = anOrderView()
  state.fulfillment = aFulfillment()
  state.shipments = []
  state.payment = aPaymentView()
})

describe('a purchase order', () => {
  test('draws the header, the scrap lots, the payout and the profit aside', () => {
    render(<AdminOrderScreen id={state.order.order.id} />)
    expect(screen.getByText('PURCHASE ORDER')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Marguerite Whitfield' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Lots' })).toBeTruthy()
    expect(screen.getByText('Pre Melt')).toBeTruthy()
    expect(screen.getByText('Payout Charge')).toBeTruthy()
    expect(screen.getByText('Total payout')).toBeTruthy()
    expect(screen.getByText('Profit Breakdown')).toBeTruthy()
  })

  test('spots follow the order row, not a guess here', () => {
    render(<AdminOrderScreen id={state.order.order.id} />)
    expect((screen.getByLabelText('Gold') as HTMLInputElement).readOnly).toBe(true)
    expect(screen.getByRole('button', { name: 'Lock Spots' })).toBeTruthy()
  })

  test('a booked shipment replaces the Create Fulfillment card', () => {
    state.fulfillment = aFulfillment({ scheduled_at: '2026-09-02T09:00:00.000Z' })
    state.shipments = [aShipment()]
    render(<AdminOrderScreen id={state.order.order.id} />)
    expect(screen.getByText('Shipment')).toBeTruthy()
    expect(screen.getByText('Label Created')).toBeTruthy()
    expect(screen.queryByText('Create Fulfillment')).toBeNull()
  })

  test('a cancelled order shows the badge, Reopen, and the return parcel', () => {
    state.order = anOrderView({
      order: { ...anOrderView().order, status: 'Cancelled' },
      actions: anActions({ cancel: false, reopen: true, finalize: false }),
    })
    state.shipments = [aShipment({ direction: 'Return' })]
    render(<AdminOrderScreen id={state.order.order.id} />)
    expect(screen.getByText('Cancelled')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reopen Order' })).toBeTruthy()
    expect(screen.getByText('Return Shipment')).toBeTruthy()
  })
})

describe('a sales order', () => {
  beforeEach(() => {
    state.order = anOrderView({
      order: { ...anOrderView().order, direction: 'sale', spots_locked: true },
      lots: [aBullionLot()],
    })
    state.payment = aPaymentView({ kind: 'charge', state: 'Due', direction: 'sale' })
  })

  test('is bullion, charges the customer, and totals a due', () => {
    render(<AdminOrderScreen id={state.order.order.id} />)
    expect(screen.getByText('SALES ORDER')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Items' })).toBeTruthy()
    expect(screen.queryByText('Pre Melt')).toBeNull()
    expect(screen.getByText('Payment Charge')).toBeTruthy()
    expect(screen.getByText('Total due')).toBeTruthy()
  })

  test('has no Profit Breakdown - the margin report is the purchase side', () => {
    render(<AdminOrderScreen id={state.order.order.id} />)
    expect(screen.queryByText('Profit Breakdown')).toBeNull()
  })

  test('its spots are locked and editable', () => {
    render(<AdminOrderScreen id={state.order.order.id} />)
    expect((screen.getByLabelText('Gold') as HTMLInputElement).readOnly).toBe(false)
    expect(screen.getByRole('button', { name: 'Unlock Spots' })).toBeTruthy()
  })
})
