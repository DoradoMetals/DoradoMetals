// The refiner order screen, composed. A refiner order is a different animal
// from a customer order: no Finalize, no Chat, a Settlement card where Profit
// sits, and a draft that is not yet an order the refiner can see.
import { describe, expect, test, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

import { aRefiner, aRefiningOrder, anAdmin } from '@/app/admin/_src_/orders/tests/fixtures'

const query = <T,>(data: T) => ({ data, isPending: false, isError: false })
const mutation = () => ({ mutate: vi.fn(), isPending: false })

const state = { order: aRefiningOrder() }

vi.mock('@dorado/client', () => ({
  useRefiningOrder: () => query(state.order),
  useRefiners: () => query([aRefiner()]),
  useAdmins: () => query([anAdmin()]),
  usePatchRefiningOrder: mutation,
  useSendRefiningOrder: mutation,
  usePatchRefiningLot: mutation,
  useDeleteRefiningLot: mutation,
  useAssignRefiningLots: mutation,
}))

const { AdminRefiningScreen } = await import('../AdminRefiningScreen')

beforeEach(() => {
  state.order = aRefiningOrder()
})

describe('a refiner sales order (we sell lots)', () => {
  test('draws the lots, the pool charge, Settlement instead of Profit, and no Chat', () => {
    render(<AdminRefiningScreen id={state.order.id} />)
    expect(screen.getByText('SALES ORDER')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Elemetal' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Lots' })).toBeTruthy()
    expect(screen.getByText('Pool Oz Remediated')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Settlement/ })).toBeTruthy()
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
    expect(screen.queryByRole('button', { name: /Spots/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Charges/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Settlement/ })).toBeNull()
  })
})

describe('a refiner purchase order (we buy bullion)', () => {
  beforeEach(() => {
    state.order = aRefiningOrder({ direction: 'buy' })
  })

  test('is a drop ship, so it carries the Linked Fulfillment card', () => {
    render(<AdminRefiningScreen id={state.order.id} />)
    expect(screen.getByText('PURCHASE ORDER')).toBeTruthy()
    expect(screen.getByText('Fulfillment · Drop ship')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Items' })).toBeTruthy()
  })

  test('has no Settlement - that belongs to the sell side', () => {
    render(<AdminRefiningScreen id={state.order.id} />)
    expect(screen.queryByRole('button', { name: /Settlement/ })).toBeNull()
  })
})
