import { describe, expect, test, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Circle } from '@dorado/icons'

const { push, ordersState } = vi.hoisted(() => ({
  push: vi.fn(),
  ordersState: { data: [] as Array<{ id: string; status: string; created_at: string }> },
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/shared/hooks/auth/queries', () => ({
  useGetSession: () => ({ user: { id: 'u-1', role: 'user', name: 'Cust' } }),
}))
vi.mock('@dorado/client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useOrders: () => ({ data: ordersState.data, isLoading: false }),
}))

import { OrdersTab } from '../../orders/ui/OrdersTab'

const ordersFixture = () => [
  { id: 'o1', status: 'Alpha', created_at: '2026-01-01T00:00:00.000Z' },
  { id: 'o2', status: 'Beta', created_at: '2026-01-02T00:00:00.000Z' },
  { id: 'o3', status: 'Alpha', created_at: '2026-01-03T00:00:00.000Z' },
  { id: 'o4', status: 'Alpha', created_at: '2026-01-04T00:00:00.000Z' },
  { id: 'o5', status: 'Beta', created_at: '2026-01-05T00:00:00.000Z' },
  { id: 'o6', status: 'Alpha', created_at: '2026-01-06T00:00:00.000Z' },
]

const statuses = ['Alpha', 'Beta', 'Gamma'] as const
const statusConfig = {
  Alpha: { icon: Circle, value_label: '' },
  Beta: { icon: Circle, value_label: '' },
  Gamma: { icon: Circle, value_label: '' },
}

function renderTab() {
  return render(
    <OrdersTab
      direction="purchase"
      statuses={statuses}
      statusConfig={statusConfig}
      emptyIcon={Circle}
      emptyCtaLabel="Get Started"
      emptyCtaHref="/somewhere"
      renderCard={(order, setActiveOrderId) => (
        <button onClick={() => setActiveOrderId(order.id)}>{`order-${order.id}`}</button>
      )}
      renderDrawer={(activeOrderId) => <div data-testid="drawer">{activeOrderId}</div>}
    />
  )
}

beforeEach(() => {
  ordersState.data = ordersFixture()
  push.mockReset()
})

describe('the shared orders tab', () => {
  test('paginates at five per page, newest first by default', () => {
    renderTab()

    expect(screen.getByText('order-o6')).toBeTruthy()
    expect(screen.getByText('order-o2')).toBeTruthy()
    expect(screen.queryByText('order-o1')).toBeNull()
  })

  test('goes to page two and shows the remaining order', async () => {
    renderTab()

    await userEvent.click(screen.getByRole('button', { name: 'Page 2' }))

    expect(screen.getByText('order-o1')).toBeTruthy()
  })

  test('narrows the list by status', async () => {
    renderTab()

    await userEvent.click(screen.getByRole('button', { name: 'Beta' }))

    expect(screen.getByText('order-o5')).toBeTruthy()
    expect(screen.getByText('order-o2')).toBeTruthy()
    expect(screen.queryByText('order-o6')).toBeNull()
    expect(screen.queryByText(/Page 2/)).toBeNull()
  })

  test('shows the empty-for-status state when a filter matches nothing', async () => {
    renderTab()

    await userEvent.click(screen.getByRole('button', { name: 'Gamma' }))

    expect(screen.getByText('No Gamma Orders Found')).toBeTruthy()
  })

  test('shows the no-orders empty state and wires the CTA to the given route', async () => {
    ordersState.data = []
    renderTab()

    expect(screen.getByText('No Orders Yet!')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Get Started' }))
    expect(push).toHaveBeenCalledWith('/somewhere')
  })

  test('opening a card renders the drawer for that order', async () => {
    renderTab()

    await userEvent.click(screen.getByText('order-o6'))

    expect(screen.getByTestId('drawer').textContent).toBe('o6')
  })
})
