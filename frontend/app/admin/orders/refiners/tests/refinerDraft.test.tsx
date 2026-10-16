import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { RefinerDraft } from '../_components'
import { LOCATION, ORDER, ORG, REFINER, desktop, employees, order, stubApi } from './fixtures'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => '/admin/orders/refiners/new',
  useSearchParams: () => new URLSearchParams('direction=sell'),
}))

const wrap = (node: React.ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

const refiners = [
  {
    id: REFINER,
    logo: null,
    created_at: null,
    updated_at: null,
    organization: { id: ORG, name: 'Elemetal Refining', email: null, phone: null, enabled: true },
  },
]

const locations = [
  {
    id: LOCATION,
    address_id: LOCATION,
    image_id: null,
    organization_id: ORG,
    name: 'Dallas',
    type: null,
    enabled: true,
    label_company_name: null,
    label_phone_number: null,
    default_return: false,
    carrier_location_code: null,
    line_1: '1200 Regal Row',
    city: 'Dallas',
    state: 'TX',
  },
]

const pick = async (name: string, option: string) => {
  fireEvent.keyDown(await screen.findByRole('combobox', { name }), { key: 'Enter' })
  fireEvent.keyDown(await screen.findByRole('option', { name: option }), { key: 'Enter' })
}

beforeEach(() => {
  desktop(true)
  push.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('RefinerDraft', () => {
  test('reads Draft sales order and holds Create until a refiner is chosen', async () => {
    stubApi({ 'GET /suppliers/get_all': refiners, 'GET /employees': employees })
    wrap(<RefinerDraft direction="sell" />)
    expect(await screen.findByText('Draft sales order')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create' })).toHaveProperty('disabled', true)
  })

  test('Create posts the refiner, direction, location and assignee, then opens the order', async () => {
    const calls = stubApi({
      'GET /suppliers/get_all': refiners,
      'GET /employees': employees,
      'GET /locations': locations,
      'POST /refining/orders': order(),
    })
    wrap(<RefinerDraft direction="buy" />)
    expect(await screen.findByText('Draft purchase order')).toBeTruthy()
    await pick('Refiner', 'Elemetal Refining')
    await pick('Location', 'Dallas · 1200 Regal Row')
    await pick('Assigned to', 'Dana Whitlock')
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/admin/orders/refiners/${ORDER}`))
    const post = calls.find((c) => c.method === 'POST')!
    expect(post.body).toEqual({
      refiner_id: REFINER,
      direction: 'buy',
      location_id: LOCATION,
      assigned_to_id: employees[0]!.user_id,
    })
    const read = calls.find((c) => c.url.pathname.endsWith('/locations'))!
    expect(read.url.searchParams.get('organization_id')).toBe(ORG)
  })
})
