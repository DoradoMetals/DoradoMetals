import { describe, expect, test, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

import {
  aDocument,
  aFulfillment,
  aLocation,
  aMethod,
  aPaymentView,
  aRefiner,
  aRefiningOrder,
  aRefiningSpot,
  anAdmin,
  anEmployee,
} from '@/app/admin/_src_/orders/tests/fixtures'

const query = <T,>(data: T) => ({ data, isPending: false, isError: false })
const mutation = () => ({ mutate: vi.fn(), isPending: false, data: undefined })

const state = {
  order: aRefiningOrder(),
  fulfillment: null as ReturnType<typeof aFulfillment> | null,
}

const handover = () => ({ mutate: vi.fn(), isPending: false, data: state.fulfillment })

vi.mock('@dorado/client', () => ({
  useRefiningOrder: () => query(state.order),
  useRefiners: () => query([aRefiner()]),
  useAdmins: () => query([anAdmin()]),
  useLocations: () => query([aLocation()]),
  useEmployees: () => query([anEmployee()]),
  useRefiningSpots: () => query([aRefiningSpot('Gold', 2411.2)]),
  useRefiningPayment: () =>
    query(aPaymentView({ order_id: null, refining_order_id: state.order.id })),
  useRefiningDocuments: () =>
    query([
      aDocument('invoice', 'Invoice', true),
      aDocument('assay_results', 'Assay Results', false),
    ]),
  useLotSearch: () => query([]),
  usePayTo: () => query([]),
  usePatchRefiningOrder: mutation,
  useSendRefiningOrder: mutation,
  useCancelRefiningOrder: mutation,
  usePatchRefiningLot: mutation,
  useDeleteRefiningLot: mutation,
  useAssignRefiningLots: mutation,
  useImportRefiningDocument: mutation,
  useCreateFulfillment: handover,
  usePatchFulfillment: mutation,
  useSetFulfillmentStatus: mutation,
  useCancelSchedule: mutation,
  useOpenPayout: mutation,
  useSendPayout: mutation,
  useOpenCharge: mutation,
}))

const { AdminRefiningScreen } = await import('../AdminRefiningScreen')

beforeEach(() => {
  state.order = aRefiningOrder()
  state.fulfillment = null
})

describe('a refiner sales order (we sell lots)', () => {
  test('draws the lots, the pool charge, Settlement instead of Profit, and no Chat', () => {
    render(<AdminRefiningScreen id={state.order.id} />)
    expect(screen.getByText('SALES ORDER')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Elemetal' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Lots' })).toBeTruthy()
    expect(screen.getByText('Pool Oz Remediated')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Settlement' })).toBeTruthy()
    expect(screen.queryByText('Profit Breakdown')).toBeNull()
    expect(screen.queryByText('Messages')).toBeNull()
  })

  test('its spots carry no lock button - the prices are the refiner quote', () => {
    render(<AdminRefiningScreen id={state.order.id} />)
    expect(screen.queryByRole('button', { name: 'Lock Spots' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Unlock Spots' })).toBeNull()
  })

  test('it has no Finalize - sending it is what a refiner order does instead', () => {
    render(<AdminRefiningScreen id={state.order.id} />)
    expect(screen.queryByRole('button', { name: 'Finalize' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Sent' }).hasAttribute('disabled')).toBe(true)
  })
})

describe('a draft', () => {
  beforeEach(() => {
    state.order = aRefiningOrder({ sent_at: null })
  })

  test('swaps the refiner name for a Select and the primary for Send to Refiner', () => {
    render(<AdminRefiningScreen id={state.order.id} />)
    expect(screen.getByText('Refiner')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send to Refiner' })).toBeTruthy()
  })

  test('carries no spots, charges or settlement until it is sent', () => {
    render(<AdminRefiningScreen id={state.order.id} />)
    expect(screen.queryByRole('button', { name: 'Spots' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Charges' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Settlement' })).toBeNull()
  })
})

describe('a refiner purchase order (we buy bullion)', () => {
  beforeEach(() => {
    state.order = aRefiningOrder({ direction: 'buy' })
    state.fulfillment = aFulfillment({
      method: aMethod('DROPOFF', 'Drop-off'),
      linked_order: { id: 'abc', number: 1112, direction: 'sale', reference: 'SO-1112' },
    })
  })

  test('is a drop ship, so it carries the Linked Fulfillment card', () => {
    render(<AdminRefiningScreen id={state.order.id} />)
    expect(screen.getByText('PURCHASE ORDER')).toBeTruthy()
    expect(screen.getByText('Fulfillment · Drop ship')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Items' })).toBeTruthy()
  })

  test('has no Settlement - that belongs to the sell side', () => {
    render(<AdminRefiningScreen id={state.order.id} />)
    expect(screen.queryByRole('button', { name: 'Settlement' })).toBeNull()
  })
})
