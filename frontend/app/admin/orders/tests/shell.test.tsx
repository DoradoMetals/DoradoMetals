import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { OrderChat, OrderDocuments, OrderHeader, OrderPhotos } from '../_components'
import { ID_A, ID_B, ID_C, desktop, stubApi } from './fixtures'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/orders',
  useSearchParams: () => new URLSearchParams(),
}))

const wrap = (node: React.ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

beforeEach(() => desktop(true))

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('OrderHeader', () => {
  const view = (over = {}) => ({
    order: { direction: 'purchase', assigned_to_id: null },
    state: 'At Refiner',
    reference: 'PO-2481',
    user: { id: ID_C, name: 'Marguerite Whitfield', email: 'm@example.invalid', orders_to_date: 7 },
    ...over,
  })
  const employees = [{ id: ID_A, user_id: ID_A, role: 'admin', enabled: true, name: 'Ann Admin' }]

  test('shows the eyebrow, the state badge, the name, the reference and orders to date', async () => {
    stubApi({ [`GET /orders/${ID_B}`]: view(), 'GET /employees': employees })
    wrap(<OrderHeader orderId={ID_B} />)
    expect(await screen.findByText('Marguerite Whitfield')).toBeTruthy()
    expect(screen.getByText('Purchase order')).toBeTruthy()
    expect(screen.getByText('At Refiner')).toBeTruthy()
    expect(screen.getAllByText('PO-2481')).toHaveLength(2)
    expect(screen.getByText('7 orders to date')).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Assigned to' })).toBeTruthy()
  })

  test('a sale reads Sales order and keeps the badge', async () => {
    stubApi({
      [`GET /orders/${ID_B}`]: view({
        order: { direction: 'sale', assigned_to_id: null },
        state: 'Preparing',
        reference: 'SO-1118',
      }),
      'GET /employees': employees,
    })
    wrap(<OrderHeader orderId={ID_B} />)
    expect(await screen.findByText('Sales order')).toBeTruthy()
    expect(screen.getByText('Preparing')).toBeTruthy()
  })

  test('choosing an assignee patches the order', async () => {
    const calls = stubApi({
      [`GET /orders/${ID_B}`]: view(),
      'GET /employees': employees,
      [`PATCH /orders/${ID_B}`]: view(),
    })
    wrap(<OrderHeader orderId={ID_B} />)
    const trigger = await screen.findByRole('combobox', { name: 'Assigned to' })
    fireEvent.keyDown(trigger, { key: 'Enter' })
    fireEvent.keyDown(await screen.findByRole('option', { name: 'Ann Admin' }), { key: 'Enter' })
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true))
    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({ assigned_to_id: ID_A })
  })
})

describe('OrderDocuments', () => {
  const docs = [
    {
      kind: 'invoice',
      name: 'Invoice',
      available: true,
      pdf_id: ID_A,
      size_bytes: 2048,
      created_at: '2026-09-02T15:07:00Z',
      created_by_id: null,
    },
    {
      kind: 'assay_results',
      name: 'Assay Results',
      available: false,
      pdf_id: null,
      size_bytes: null,
      created_at: null,
      created_by_id: null,
    },
  ]

  test('formats size and date and wires Download, Send and Import', async () => {
    const calls = stubApi({
      [`GET /orders/${ID_B}/documents`]: docs,
      [`GET /orders/${ID_B}/documents/invoice`]: { ok: true },
      [`POST /orders/${ID_B}/documents/invoice/send`]: docs[0],
      [`POST /orders/${ID_B}/documents/assay_results`]: docs[0],
    })
    wrap(<OrderDocuments orderId={ID_B} />)
    expect(await screen.findByText(/PDF · 2 KB · Sep 2, \d{1,2}:\d{2} (AM|PM)/)).toBeTruthy()
    expect(screen.getByText('Not yet available')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Download Invoice' }))
    await waitFor(() =>
      expect(
        calls.some((c) => c.method === 'GET' && c.url.pathname.endsWith('/documents/invoice'))
      ).toBe(true)
    )

    fireEvent.click(screen.getByRole('button', { name: 'Send Invoice' }))
    await waitFor(() =>
      expect(
        calls.some((c) => c.method === 'POST' && c.url.pathname.endsWith('/invoice/send'))
      ).toBe(true)
    )

    fireEvent.click(screen.getByRole('button', { name: 'Import Assay Results' }))
    const input = screen.getByLabelText('Import document') as HTMLInputElement
    fireEvent.change(input, {
      target: { files: [new File(['%PDF'], 'assay.pdf', { type: 'application/pdf' })] },
    })
    await waitFor(() =>
      expect(
        calls.some(
          (c) => c.method === 'POST' && c.url.pathname.endsWith('/documents/assay_results')
        )
      ).toBe(true)
    )
  })

  test('shows the empty and error states', async () => {
    stubApi({ [`GET /orders/${ID_B}/documents`]: [] })
    wrap(<OrderDocuments orderId={ID_B} />)
    expect(await screen.findByText('None yet')).toBeTruthy()
  })

  test('shows the error state when the read fails', async () => {
    stubApi({})
    wrap(<OrderDocuments orderId={ID_B} />)
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeTruthy()
  })
})

describe('OrderChat', () => {
  const sms = [
    {
      id: ID_A,
      direction: 'inbound',
      from_number: '+15555550142',
      to_number: '+15555550100',
      body: 'Is my order in?',
      status: 'received',
      created_at: '2026-09-02T15:07:00Z',
    },
    {
      id: ID_B,
      direction: 'outbound',
      from_number: '+15555550100',
      to_number: '+15555550142',
      body: 'It arrived today.',
      status: 'delivered',
      created_at: '2026-09-02T15:09:00Z',
    },
  ]
  const timeline = [
    {
      id: ID_C,
      kind: 'call',
      at: '2026-09-02T16:00:00Z',
      direction: 'outbound',
      summary: 'Call',
      status: 'completed',
      call_kind: 'Outgoing',
      duration_seconds: 161,
      recording_url: null,
      actor_id: null,
      actor_name: 'Ann Admin',
    },
    {
      id: ID_A,
      kind: 'sms',
      at: '2026-09-02T15:07:00Z',
      direction: 'inbound',
      summary: 'Is my order in?',
      status: 'received',
      call_kind: null,
      duration_seconds: null,
      recording_url: null,
      actor_id: null,
      actor_name: null,
    },
  ]

  test('feeds the customer thread and the calls timeline', async () => {
    stubApi({ 'GET /sms': sms, [`GET /customers/${ID_C}/timeline`]: timeline })
    wrap(<OrderChat userId={ID_C} />)
    expect(await screen.findByText('Customer messages')).toBeTruthy()
    expect(await screen.findByText('Is my order in?')).toBeTruthy()
    expect(screen.getByText('It arrived today.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Calls' }))
    expect(await screen.findByText('Customer calls')).toBeTruthy()
    expect(screen.getByText(/2:41/)).toBeTruthy()
    expect(screen.queryByText('Is my order in?')).toBeNull()
  })

  test('sending texts the customer', async () => {
    const calls = stubApi({
      'GET /sms': sms,
      [`GET /customers/${ID_C}/timeline`]: timeline,
      'POST /sms': sms[1],
    })
    wrap(<OrderChat userId={ID_C} />)
    const field = await screen.findByLabelText(/Text \+1555/)
    fireEvent.change(field, { target: { value: 'Paid today' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({
      user_id: ID_C,
      body: 'Paid today',
    })
  })

  test('shows the error state', async () => {
    stubApi({})
    wrap(<OrderChat userId={ID_C} />)
    expect(await screen.findByText("Couldn't load messages")).toBeTruthy()
  })
})

describe('OrderPhotos', () => {
  const images = [
    { image_id: ID_A, sort_order: 0, url: 'https://img.example.invalid/a.jpg' },
    { image_id: ID_B, sort_order: 1, url: 'https://img.example.invalid/b.jpg' },
  ]

  test('feeds the viewer from the lot images and steps through them', async () => {
    stubApi({ [`GET /lots/${ID_C}/images`]: images })
    wrap(<OrderPhotos lotId={ID_C} title="14K Gold · 2481-A" />)
    expect(await screen.findByText('1 of 2')).toBeTruthy()
    expect(screen.getByText('14K Gold · 2481-A')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next photo' }))
    expect(await screen.findByText('2 of 2')).toBeTruthy()
  })
})
