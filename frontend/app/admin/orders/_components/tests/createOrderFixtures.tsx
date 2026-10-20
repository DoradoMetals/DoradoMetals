import { expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { CreateOrderDrawer, type CreateOrderDrawerProps } from '../CreateOrderDrawer'
import { emptyDrawerState, type DrawerState } from '../../_lib/createOrder'

export const IDS = {
  customer: '00000000-0000-4000-8000-0000000000c1',
  bare: '00000000-0000-4000-8000-0000000000c2',
  owner: '00000000-0000-4000-8000-0000000000e1',
  employee: '00000000-0000-4000-8000-0000000000e2',
  eagle: '00000000-0000-4000-8000-0000000000b1',
  home: '00000000-0000-4000-8000-0000000000a1',
  keller: '00000000-0000-4000-8000-0000000000a2',
  austin: '00000000-0000-4000-8000-0000000000a3',
  link: '00000000-0000-4000-8000-0000000000d1',
  pendingLink: '00000000-0000-4000-8000-0000000000d3',
  refiner: '00000000-0000-4000-8000-000000000301',
  openSale: '00000000-0000-4000-8000-000000000302',
  lotA: '00000000-0000-4000-8000-0000000002a1',
  lotB: '00000000-0000-4000-8000-0000000002b1',
  lotC: '00000000-0000-4000-8000-0000000002c1',
  service: '00000000-0000-4000-8000-0000000000f2',
  package: '00000000-0000-4000-8000-0000000000f3',
  created: '00000000-0000-4000-8000-0000000009a1',
  fulfillment: '00000000-0000-4000-8000-0000000009f1',
  carrierDropoff: '00000000-0000-4000-8000-000000000501',
  carrierPickup: '00000000-0000-4000-8000-000000000502',
  ownLabel: '00000000-0000-4000-8000-000000000503',
  doradoPickup: '00000000-0000-4000-8000-000000000504',
  appointment: '00000000-0000-4000-8000-000000000505',
  walkIn: '00000000-0000-4000-8000-000000000506',
  dropship: '00000000-0000-4000-8000-000000000507',
  saleAppointment: '00000000-0000-4000-8000-000000000508',
  dropoff: '00000000-0000-4000-8000-000000000509',
  ach: '00000000-0000-4000-8000-000000000601',
  echeck: '00000000-0000-4000-8000-000000000602',
  wire: '00000000-0000-4000-8000-000000000603',
  balance: '00000000-0000-4000-8000-000000000604',
  saleWire: '00000000-0000-4000-8000-000000000605',
}

export const OWNER = { id: IDS.owner, name: 'Jacob Johnson', role: 'owner' as const }
export const EMPLOYEE = { id: IDS.employee, name: 'Dana Whitlock', role: 'employee' as const }

const method = (
  id: string,
  type: string,
  label: string,
  category: string,
  direction: string | null
) => ({
  id,
  type,
  label,
  admin_label: null,
  category,
  direction,
  enabled: true,
  hidden: false,
  is_default: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
})

export const PURCHASE_METHODS = [
  method(IDS.carrierDropoff, 'CARRIER DROPOFF', 'Dropoff', 'SHIPMENT', 'purchase'),
  method(IDS.carrierPickup, 'CARRIER PICKUP', 'Pickup', 'SHIPMENT', 'purchase'),
  method(IDS.ownLabel, 'OWN LABEL', 'Own Label', 'SHIPMENT', 'purchase'),
  method(IDS.doradoPickup, 'PICKUP', 'Pickup', 'PICKUP', 'purchase'),
  method(IDS.appointment, 'APPOINTMENT', 'Appointment', 'DIRECT', 'purchase'),
  method(IDS.walkIn, 'WALK IN', 'Walk In', 'DIRECT', 'purchase'),
]

export const SALE_METHODS = [
  method(IDS.dropship, 'DROPSHIP', 'Shipment', 'SHIPMENT', 'sale'),
  method(IDS.saleAppointment, 'APPOINTMENT', 'Appointment', 'DIRECT', 'sale'),
]

export const REFINER_METHODS = [method(IDS.dropoff, 'DROP OFF', 'Drop-off', 'DROPOFF', null)]

const payMethod = (id: string, type: string, label: string, direction: string) => ({
  id,
  type,
  label,
  direction,
  enabled: true,
  flat_fee: type === 'WIRE' ? 20 : 0,
})

export const PAYOUT_METHODS = [
  payMethod(IDS.ach, 'ACH', 'ACH Transfer', 'purchase'),
  payMethod(IDS.echeck, 'ECHECK', 'Deluxe eCheck', 'purchase'),
  payMethod(IDS.wire, 'WIRE', 'Wire Transfer', 'purchase'),
  payMethod(IDS.balance, 'DORADO_ACCOUNT', 'Dorado balance', 'purchase'),
]

export const CUSTOMER = {
  id: IDS.customer,
  name: 'Marguerite Whitfield',
  email: 'marguerite@whitfield.me',
  phone_number: '+15125550117',
  role: 'user',
}

export const VERIFIED = {
  id: IDS.link,
  user_id: IDS.customer,
  status: 'verified',
  bank_name: 'Chase',
  account_name: 'Marguerite Whitfield',
  last_four: '4417',
  channel: 'sms',
  sent_to: '+15125550117',
  sent_at: '2026-06-18T19:31:00Z',
  created_at: '2026-06-18T19:31:00Z',
}

export const PENDING = {
  ...VERIFIED,
  id: IDS.pendingLink,
  status: 'pending',
  bank_name: null,
  account_name: null,
  last_four: null,
}

export const ON_HAND = [
  {
    id: IDS.lotA,
    reference: '2481-A',
    product_name: '14 Karat Gold',
    metal_id: 'Gold',
    bullion_id: null,
    quantity: 1,
    post_melt: 139.22,
    unit: 'g',
    purity: 0.563,
    premium: 0.92,
    order_reference: 'PO-2481',
    position: 'on hand',
  },
  {
    id: IDS.lotB,
    reference: '2481-B',
    product_name: '18 Karat Gold',
    metal_id: 'Gold',
    bullion_id: null,
    quantity: 1,
    post_melt: 60.94,
    unit: 'g',
    purity: 0.73,
    premium: 0.94,
    order_reference: 'PO-2481',
    position: 'on hand',
  },
  {
    id: IDS.lotC,
    reference: '2481-C',
    product_name: 'Sterling Silver',
    metal_id: 'Silver',
    bullion_id: null,
    quantity: 1,
    post_melt: 1198.6,
    unit: 'g',
    purity: 0.925,
    premium: 0.88,
    order_reference: 'PO-2481',
    position: 'on hand',
  },
]

type PreviewLot = { premium?: number; bullion_id?: string }
type PreviewBody = { kind: string; lots?: PreviewLot[]; lot_ids?: string[] }

const line = (position: number, over: Record<string, unknown>) => ({
  position,
  lot_id: null,
  metal_id: 'Gold',
  spot: 2412.8,
  fine_oz: 0,
  metal_value: 0,
  premium: 0,
  total: 0,
  ...over,
})

export function previewFor(body: PreviewBody) {
  const base = {
    kind: body.kind,
    spots_at: '2026-06-18T15:42:00.000Z',
    spots: [{ metal_id: 'Gold', spot: 2412.8 }],
    credit_applied: 0,
  }
  if (body.kind === 'refiner_sale') {
    const lines = (body.lot_ids ?? []).map((lot_id, i) =>
      line(i, { lot_id, fine_oz: i === 0 ? 2.519 : 1.431, total: i === 0 ? 5102.4 : 2180.26 })
    )
    return {
      ...base,
      lines,
      fine_oz: [{ metal_id: 'Gold', oz: 3.95 }],
      metal_value: 9530.56,
      total: lines.length === 2 ? 7282.66 : (lines[0]?.total ?? 0),
      total_due: 0,
    }
  }
  const lots = body.lots ?? []
  if (lots.length === 0) {
    return { ...base, lines: [], fine_oz: [], metal_value: 0, total: 0, total_due: 0 }
  }
  const lines = lots.map((lot, i) =>
    lot.bullion_id
      ? line(i, {
          fine_oz: 10,
          premium: lot.premium ?? (body.kind === 'customer_sale' ? 1.035 : 0.98),
          total: body.kind === 'customer_sale' ? 24972.48 : 23645.44,
        })
      : line(i, {
          fine_oz: 0.232,
          premium: lot.premium ?? 0.75,
          total: lot.premium === 0.8 ? 99999.99 : 420.6,
        })
  )
  const total = lots.some((lot) => lot.premium === 0.8)
    ? 11111.11
    : body.kind === 'customer_sale'
      ? 24972.48
      : lines.length === 2
        ? 24066.04
        : (lines[0]?.total ?? 0)
  return {
    ...base,
    lines,
    fine_oz: [{ metal_id: 'Gold', oz: lines.length === 2 ? 10.232 : 10 }],
    metal_value: 24688.1,
    total,
    credit_applied: body.kind === 'customer_sale' ? 412.9 : 0,
    total_due: body.kind === 'customer_sale' ? 24559.58 : total,
  }
}

export type Hit = { method: string; path: string; url: URL; body: unknown }
type Reply = unknown | { status: number; body: unknown }
export type Responder = Reply | ((url: URL, body: unknown, hits: Hit[]) => Reply)
export type Routes = Record<string, Responder>

const isReply = (value: unknown): value is { status: number; body: unknown } =>
  !!value && typeof value === 'object' && 'status' in value && 'body' in value

export function defaultRoutes(over: Routes = {}): Routes {
  return {
    'GET /search': (url: URL) =>
      (url.searchParams.get('q') ?? '').toLowerCase().startsWith('mar')
        ? [
            {
              kind: 'customer',
              id: IDS.customer,
              reference: 'Marguerite Whitfield',
              title: 'marguerite@whitfield.me',
            },
          ]
        : [],
    [`GET /users/${IDS.customer}`]: CUSTOMER,
    [`GET /users/${IDS.bare}`]: { ...CUSTOMER, id: IDS.bare, name: 'Ada Bare', phone_number: null },
    'GET /employees': [
      { id: IDS.owner, user_id: IDS.owner, role: 'owner', enabled: true, name: 'Jacob Johnson' },
      {
        id: IDS.employee,
        user_id: IDS.employee,
        role: 'employee',
        enabled: true,
        name: 'Dana Whitlock',
      },
    ],
    'GET /products/admin': [
      { id: IDS.eagle, name: '1 oz Gold American Eagle', metal_id: 'Gold', content: 1 },
    ],
    'POST /pricing/preview': (_url: URL, body: unknown) => previewFor(body as PreviewBody),
    'GET /fulfillments/methods': (url: URL) =>
      url.searchParams.get('direction') === 'sale' ? SALE_METHODS : PURCHASE_METHODS,
    'GET /fulfillments/methods/refiner': REFINER_METHODS,
    'GET /addresses': [
      {
        address: {
          id: IDS.home,
          line_1: '412 Oak Hollow Dr',
          city: 'Austin',
          state: 'TX',
          postal_code: '78745',
        },
        user_address: { user_id: IDS.customer, address_id: IDS.home },
        locked: false,
      },
    ],
    'GET /locations': [
      { id: IDS.keller, name: 'Keller office', organization_id: null, enabled: true },
      { id: IDS.austin, name: 'Austin vault', organization_id: null, enabled: true },
    ],
    'GET /carrier_services/offered': [
      { id: IDS.service, name: 'FedEx Express Saver', carrier_id: 'fedex' },
    ],
    'GET /shipping/packages': [{ id: IDS.package, label: 'Medium' }],
    'GET /payments/methods': (url: URL) =>
      url.searchParams.get('direction') === 'sale'
        ? [payMethod(IDS.saleWire, 'WIRE', 'Wire Transfer', 'sale')]
        : PAYOUT_METHODS,
    [`GET /accounts/${IDS.customer}/bank-links`]: [VERIFIED],
    [`GET /accounts/${IDS.bare}/bank-links`]: [],
    'GET /suppliers/get_all': [
      {
        id: IDS.refiner,
        logo: null,
        organization: {
          id: IDS.refiner,
          name: 'Asahi Refining',
          email: null,
          phone: null,
          enabled: true,
        },
      },
    ],
    'GET /refining/orders': { counts: { orders: 0, lots: 0 }, items: [] },
    'GET /lots': (url: URL) =>
      ON_HAND.filter(
        (lot) =>
          !url.searchParams.get('metal_id') || lot.metal_id === url.searchParams.get('metal_id')
      ),
    'POST /orders/admin': {
      status: 201,
      body: { order: { id: IDS.created, direction: 'purchase' } },
    },
    'POST /refining/orders': {
      status: 201,
      body: { id: IDS.created, direction: 'sell', number: 'RS-2501' },
    },
    'POST /fulfillments': { fulfillment: { id: IDS.fulfillment } },
    [`PATCH /fulfillments/${IDS.fulfillment}`]: { fulfillment: { id: IDS.fulfillment } },
    ...over,
  }
}

export function stubDrawerApi(over: Routes = {}) {
  const routes = defaultRoutes(over)
  const hits: Hit[] = []
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const method = init?.method ?? 'GET'
    const path = url.pathname.replace(/^\/api/, '')
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    hits.push({ method, path, url, body })
    const key = `${method} ${path}`
    if (!(key in routes)) {
      if (method === 'GET') return new Response('[]', { status: 200 })
      return new Response(JSON.stringify({ error: { message: `not stubbed: ${key}` } }), {
        status: 404,
      })
    }
    const responder = routes[key]
    const reply = await (typeof responder === 'function' ? responder(url, body, hits) : responder)
    if (isReply(reply)) return new Response(JSON.stringify(reply.body), { status: reply.status })
    return new Response(JSON.stringify(reply), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return hits
}

export const previews = (hits: Hit[]) =>
  hits.filter((hit) => hit.method === 'POST' && hit.path === '/pricing/preview')

export const writes = (hits: Hit[]) =>
  hits.filter((hit) => hit.method !== 'GET' && hit.path !== '/pricing/preview')

export function desktop(on: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: on,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

export const purchaseState = (over: Partial<DrawerState> = {}): Partial<DrawerState> => ({
  ...emptyDrawerState('customer_purchase'),
  customer_id: IDS.customer,
  lots: [
    {
      key: 'row-1',
      form: 'scrap',
      metal_id: 'Gold',
      pre_melt: '12.40',
      unit: 'g',
      purity: '0.583',
      bullion_id: null,
      quantity: '',
      premium: null,
    },
    {
      key: 'row-2',
      form: 'bullion',
      metal_id: null,
      pre_melt: '',
      unit: '',
      purity: '',
      bullion_id: IDS.eagle,
      quantity: '10',
      premium: null,
    },
  ],
  ...over,
})

export function mountDrawer(props: Partial<CreateOrderDrawerProps> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onCreated = vi.fn()
  const onOpenChange = vi.fn()
  const utils = render(
    <QueryClientProvider client={client}>
      <CreateOrderDrawer
        open
        onOpenChange={onOpenChange}
        viewer={OWNER}
        onCreated={onCreated}
        {...props}
      />
    </QueryClientProvider>
  )
  return { ...utils, client, onCreated, onOpenChange }
}

export const drawer = () => screen.findByRole('dialog')

export async function choose(label: string | RegExp, option: string | RegExp) {
  const dialog = await drawer()
  const combobox = within(dialog).getByRole('combobox', { name: label })
  fireEvent.keyDown(combobox, { key: 'Enter' })
  fireEvent.click(await screen.findByRole('option', { name: option }))
}

export async function next() {
  const dialog = await drawer()
  const button = within(dialog).getByRole('button', { name: 'Continue' })
  await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false))
  fireEvent.click(button)
}

export async function pickCustomer() {
  const dialog = await drawer()
  fireEvent.change(within(dialog).getByRole('combobox', { name: 'Customer' }), {
    target: { value: 'Marg' },
  })
  fireEvent.click(await screen.findByRole('option', { name: /Marguerite Whitfield/ }))
}

export const lastPreview = (hits: Hit[]) => {
  const all = previews(hits)
  return all[all.length - 1]?.body as Record<string, unknown> | undefined
}
