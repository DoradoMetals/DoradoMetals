import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { OrdersScreen } from '../_components'
import { ID_A, ID_B, desktop, item, stubApi, type Routes } from './fixtures'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/orders',
  useSearchParams: () => new URLSearchParams(),
}))

const REFINER = '00000000-0000-4000-8000-0000000000f1'
const ORG = '00000000-0000-4000-8000-0000000000f2'
const SITE = '00000000-0000-4000-8000-0000000000f3'

const sorts = [
  {
    id: ID_A,
    key: 'newest',
    label: 'Newest first',
    sort_field: 'created_at',
    descending: true,
    sort_order: 1,
  },
]

function routes(over: Routes = {}): Routes {
  return {
    'GET /orders/sorts': sorts,
    'GET /employees': [
      { id: ID_A, user_id: ID_A, role: 'admin', enabled: true, name: 'Ann Admin' },
    ],
    'GET /suppliers/get_all': [
      {
        id: REFINER,
        logo: null,
        organization: { id: ORG, name: 'Elemetal', email: null, phone: null, enabled: true },
      },
    ],
    'GET /locations': [{ id: SITE, organization_id: ORG, name: 'Dallas', enabled: true }],
    'GET /search': [],
    'GET /pricing/selection': {
      order_count: 2,
      lot_count: 10,
      estimated_value: 15532.7,
      fine_oz: [{ metal_id: 'Gold', oz: 6.18 }],
    },
    'GET /orders': {
      counts: { orders: 2, unassigned_lots: 18 },
      items: [item(ID_A, 2481, ['assign_lots', 'cancel']), item(ID_B, 2488, ['cancel'])],
    },
    ...over,
  }
}

const choose = async (combobox: HTMLElement, option: string) => {
  fireEvent.keyDown(combobox, { key: 'Enter' })
  fireEvent.keyDown(await screen.findByRole('option', { name: option }), { key: 'Enter' })
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <OrdersScreen />
    </QueryClientProvider>
  )
}

beforeEach(() => desktop(true))

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the orders screen', () => {
  test('renders the frame and one card per order with the server estimate', async () => {
    stubApi(routes())
    mount()
    expect(await screen.findByText('PO-2481')).toBeTruthy()
    expect(screen.getByText('PO-2488')).toBeTruthy()
    expect(screen.getAllByText(/3 lots · \$18,420 est\./)).toHaveLength(2)
    expect(screen.getByRole('heading', { name: 'Orders & Lots' })).toBeTruthy()
    expect(screen.getAllByText('2 orders · 18 unassigned lots').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Received Sep 2, \d{1,2}:\d{2} (AM|PM)/)).toHaveLength(2)
  })

  test('the filters become list params', async () => {
    const calls = stubApi(routes())
    mount()
    await screen.findByText('PO-2481')
    fireEvent.click(screen.getByRole('radio', { name: 'Awaiting Finalize' }))
    await waitFor(() =>
      expect(
        calls.some(
          (c) =>
            c.url.pathname.endsWith('/orders') &&
            c.url.searchParams.get('state') === 'Awaiting Finalize'
        )
      ).toBe(true)
    )
    fireEvent.click(screen.getByRole('button', { name: 'Sales' }))
    await waitFor(() =>
      expect(
        calls.some(
          (c) =>
            c.url.pathname.endsWith('/orders') && c.url.searchParams.get('direction') === 'sale'
        )
      ).toBe(true)
    )
    const last = calls.filter((c) => c.url.pathname.endsWith('/orders')).at(-1)!
    expect(last.url.searchParams.get('limit')).toBe('24')
    expect(last.url.searchParams.get('offset')).toBe('0')
  })

  test('Show defaults to In progress and sends every state but Completed and Cancelled', async () => {
    const calls = stubApi(routes())
    mount()
    await screen.findByText('PO-2481')
    const first = calls.find((c) => c.url.pathname.endsWith('/orders'))!
    const states = first.url.searchParams.getAll('state')
    expect(states.length).toBeGreaterThan(0)
    expect(states).not.toContain('Completed')
    expect(states).not.toContain('Cancelled')
    expect(states).toContain('Awaiting Receipt')
    await choose(screen.getByRole('combobox', { name: 'Show' }), 'All')
    await waitFor(() => {
      const last = calls.filter((c) => c.url.pathname.endsWith('/orders')).at(-1)!
      expect(last.url.searchParams.getAll('state')).toEqual([])
    })
  })

  test('pagination is always visible and drives offset from the filtered total', async () => {
    const calls = stubApi(
      routes({
        'GET /orders': {
          counts: { orders: 50, unassigned_lots: 3 },
          items: [item(ID_A, 2481, ['cancel'])],
        },
      })
    )
    mount()
    await screen.findByText('PO-2481')
    expect(screen.getAllByText('50 orders · 3 unassigned lots').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Page 2' }))
    await waitFor(() => {
      const last = calls.filter((c) => c.url.pathname.endsWith('/orders')).at(-1)!
      expect(last.url.searchParams.get('offset')).toBe('24')
    })
  })

  test('shows pagination for a single page', async () => {
    stubApi(routes())
    mount()
    await screen.findByText('PO-2481')
    expect(screen.getByRole('button', { name: 'Page 1' })).toBeTruthy()
  })

  test('the debounced search is passed to the list as q', async () => {
    const calls = stubApi(routes())
    mount()
    await screen.findByText('PO-2481')
    fireEvent.change(screen.getByRole('textbox', { name: 'Search orders' }), {
      target: { value: 'Earle' },
    })
    await waitFor(() =>
      expect(
        calls.some(
          (c) => c.url.pathname.endsWith('/orders') && c.url.searchParams.get('q') === 'Earle'
        )
      ).toBe(true)
    )
  })

  test('Show maps to has_unassigned_lots and Assigned to to assigned_to_id', async () => {
    const calls = stubApi(routes())
    mount()
    await screen.findByText('PO-2481')
    await choose(screen.getByRole('combobox', { name: 'Show' }), 'Unassigned')
    await waitFor(() =>
      expect(
        calls.some(
          (c) =>
            c.url.pathname.endsWith('/orders') &&
            c.url.searchParams.get('has_unassigned_lots') === 'true'
        )
      ).toBe(true)
    )
    await choose(screen.getByRole('combobox', { name: 'Assigned to' }), 'Unassigned')
    await waitFor(() =>
      expect(
        calls.some(
          (c) =>
            c.url.pathname.endsWith('/orders') &&
            c.url.searchParams.get('assigned_to_id') === 'unassigned'
        )
      ).toBe(true)
    )
  })

  test('selection shows the server summary and totals', async () => {
    stubApi(routes())
    mount()
    await screen.findByText('PO-2481')
    const boxes = screen.getAllByRole('checkbox')
    fireEvent.click(boxes[0])
    fireEvent.click(boxes[1])
    const bar = await screen.findByRole('region', { name: 'Selection' })
    expect(await within(bar).findByText('2 orders selected · 10 lots')).toBeTruthy()
    expect(within(bar).getByText('$15,532.70 est. · 6.18 oz fine gold')).toBeTruthy()
    expect(within(bar).getByText('Batch into')).toBeTruthy()
  })

  test('the batch action is enabled only when every selected order offers it', async () => {
    stubApi(routes())
    mount()
    await screen.findByText('PO-2481')
    const boxes = screen.getAllByRole('checkbox')
    fireEvent.click(boxes[0])
    let bar = await screen.findByRole('region', { name: 'Selection' })
    expect(within(bar).getByRole('combobox').hasAttribute('disabled')).toBe(false)
    fireEvent.click(boxes[1])
    bar = await screen.findByRole('region', { name: 'Selection' })
    await waitFor(() =>
      expect(within(bar).getByRole('combobox').hasAttribute('disabled')).toBe(true)
    )
    expect(within(bar).getByText('Every selected order must offer Assign lots.')).toBeTruthy()
  })

  test('submitting posts the order ids with the refiner and location', async () => {
    const calls = stubApi(
      routes({
        'POST /refining/orders/batch': { order: {}, taken: 3, skipped: [] },
      })
    )
    mount()
    await screen.findByText('PO-2481')
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    const bar = await screen.findByRole('region', { name: 'Selection' })
    await choose(within(bar).getByRole('combobox'), 'Elemetal · Dallas')
    fireEvent.click(within(bar).getByRole('button', { name: 'Batch' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
    const post = calls.find((c) => c.method === 'POST')!
    expect(post.body).toEqual({ refiner_id: REFINER, location_id: SITE, order_ids: [ID_A] })
  })

  test('mobile labels the same control Send to', async () => {
    desktop(false)
    stubApi(routes())
    mount()
    await screen.findByText('PO-2481')
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    const bar = await screen.findByRole('region', { name: 'Selection' })
    expect(within(bar).getByText('Send to')).toBeTruthy()
  })

  test('an empty list says so', async () => {
    stubApi(routes({ 'GET /orders': { counts: { orders: 0, unassigned_lots: 0 }, items: [] } }))
    mount()
    expect(await screen.findByText('No orders here')).toBeTruthy()
    expect(screen.getByText('Orders that match these filters show here.')).toBeTruthy()
  })

  test('a failed list shows the error with Try again', async () => {
    const { 'GET /orders': _omit, ...rest } = routes()
    stubApi(rest)
    mount()
    expect(await screen.findByText("Couldn't load orders")).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  test('while loading it shows the skeletons', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {}))
    )
    mount()
    expect(screen.getByRole('status', { name: 'Loading orders' })).toBeTruthy()
  })

  test('pages by 24 over counts.orders', async () => {
    const calls = stubApi(
      routes({
        'GET /orders': {
          counts: { orders: 120, unassigned_lots: 0 },
          items: [item(ID_A, 2481, [])],
        },
      })
    )
    mount()
    await screen.findByText('PO-2481')
    fireEvent.click(screen.getByRole('button', { name: 'Page 2' }))
    await waitFor(() =>
      expect(
        calls.some(
          (c) => c.url.pathname.endsWith('/orders') && c.url.searchParams.get('offset') === '24'
        )
      ).toBe(true)
    )
  })
})
