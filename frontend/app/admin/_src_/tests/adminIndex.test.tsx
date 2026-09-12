import { describe, expect, test, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { OrderListItem, RefiningOrderView } from '@dorado/contracts'

const state = {
  orders: { data: [] as OrderListItem[], isPending: false, isError: false },
  refining: { data: [] as RefiningOrderView[], isPending: false, isError: false },
}

vi.mock('@dorado/client', () => ({
  useOrders: () => state.orders,
  useRefiningOrders: () => state.refining,
}))

const { AdminIndex } = await import('../AdminIndex')

const anOrder = (over: Partial<OrderListItem> = {}): OrderListItem =>
  ({
    id: '11111111-1111-4111-8111-111111111111',
    user_id: '22222222-2222-4222-8222-222222222222',
    direction: 'purchase',
    state: 'In Transit',
    number: 16286,
    created_at: '2026-09-04T15:30:00.000Z',
    spots_locked: false,
    totals: null,
    reference: 'PO-16286',
    customer: {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Test Person',
      email: 'test@dorado.test',
    },
    ...over,
  }) as OrderListItem

const aRefiningOrder = (over: Partial<RefiningOrderView> = {}): RefiningOrderView =>
  ({
    id: '33333333-3333-4333-8333-333333333333',
    number: 2481,
    direction: 'sell',
    state: 'Pending assay',
    refiner_id: '44444444-4444-4444-8444-444444444444',
    refiner: { organization: { name: 'Elemetal' } },
    created_at: '2026-09-05T12:00:00.000Z',
    ...over,
  }) as unknown as RefiningOrderView

const tableFor = (label: string) => screen.getByRole('table', { name: label })

beforeEach(() => {
  state.orders = { data: [], isPending: false, isError: false }
  state.refining = { data: [], isPending: false, isError: false }
})

describe('the admin index', () => {
  test('draws a skeleton, and no table, while the reads are in flight', () => {
    state.orders = { data: [], isPending: true, isError: false }
    state.refining = { data: [], isPending: true, isError: false }
    render(<AdminIndex />)

    expect(screen.getByTestId('Orders-loading')).toBeTruthy()
    expect(screen.getByTestId('Refiner orders-loading')).toBeTruthy()
    expect(screen.queryAllByRole('table')).toHaveLength(0)
  })

  test('an empty answer is the library EmptyState, not a blank table body', () => {
    render(<AdminIndex />)

    expect(within(tableFor('Orders')).getByText('No orders yet')).toBeTruthy()
    expect(within(tableFor('Refiner orders')).getByText('No refiner orders yet')).toBeTruthy()
  })

  test('each order is a row linking to its own screen', () => {
    state.orders = {
      data: [anOrder(), anOrder({ id: '55555555-5555-4555-8555-555555555555', number: 16287 })],
      isPending: false,
      isError: false,
    }
    render(<AdminIndex />)

    const table = tableFor('Orders')
    expect(table.querySelectorAll('tbody tr')).toHaveLength(2)

    const link = within(table).getByRole('link', { name: '16286' })
    expect(link.getAttribute('href')).toBe('/admin/orders/11111111-1111-4111-8111-111111111111')
    const row = link.closest('tr') as HTMLElement
    expect(within(row).getByText('purchase')).toBeTruthy()
    expect(within(row).getByText('In Transit')).toBeTruthy()
    expect(within(row).getByText('PO-16286')).toBeTruthy()
    expect(within(row).getByText('Test Person')).toBeTruthy()
  })

  test('the reference and customer come off the row, never composed on screen', () => {
    state.orders = {
      data: [
        anOrder({
          reference: 'SO-9001',
          customer: { id: 'u1', name: 'Ada Lovelace', email: 'ada@dorado.test' },
        }),
      ],
      isPending: false,
      isError: false,
    }
    render(<AdminIndex />)

    const row = within(tableFor('Orders'))
      .getByRole('link', { name: '16286' })
      .closest('tr') as HTMLElement
    expect(within(row).getByText('SO-9001')).toBeTruthy()
    expect(within(row).getByText('Ada Lovelace')).toBeTruthy()
  })

  test('each refiner order links to the refining screen and names its refiner', () => {
    state.refining = { data: [aRefiningOrder()], isPending: false, isError: false }
    render(<AdminIndex />)

    const table = tableFor('Refiner orders')
    const link = within(table).getByRole('link', { name: '2481' })
    expect(link.getAttribute('href')).toBe('/admin/refining/33333333-3333-4333-8333-333333333333')
    const row = link.closest('tr') as HTMLElement
    expect(within(row).getByText('Elemetal')).toBeTruthy()
    expect(within(row).getByText('Pending assay')).toBeTruthy()
  })

  test('a refused list says so instead of drawing an empty one', () => {
    state.orders = { data: [], isPending: false, isError: true }
    render(<AdminIndex />)

    expect(screen.getByText('Orders did not load')).toBeTruthy()
    expect(screen.queryByRole('table', { name: 'Orders' })).toBeNull()
    expect(screen.getByRole('table', { name: 'Refiner orders' })).toBeTruthy()
  })
})
