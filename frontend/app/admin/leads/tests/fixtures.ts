import { vi } from 'vitest'
import { screen, within, fireEvent } from '@testing-library/react'
import type {
  ActivityEntry,
  EmployeeSummary,
  EstimateItemImageView,
  EstimateItemView,
  EstimateUnit,
  LeadDocumentView,
  LeadEstimate,
  LeadEstimateTotal,
  LeadLookup,
  LeadSummary,
  LeadTimeline,
  LeadView,
  PurityLookup,
  SmsThreadMessage,
  WeightUnitLookup,
} from '@dorado/contracts'

export const NOW = new Date('2026-10-19T17:00:00.000Z')

export const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
export const MINUTE = 60_000
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR

export const LEAD_A = '00000000-0000-4000-8000-00000000000a'
export const LEAD_B = '00000000-0000-4000-8000-00000000000b'
export const LEAD_C = '00000000-0000-4000-8000-00000000000c'
export const LEAD_D = '00000000-0000-4000-8000-00000000000d'
export const USER_JACOB = '00000000-0000-4000-8000-0000000000e1'
export const USER_RENEE = '00000000-0000-4000-8000-0000000000e2'

export const SOURCE_WEBSITE = '00000000-0000-4000-8000-0000000000a1'
export const SOURCE_PHONE = '00000000-0000-4000-8000-0000000000a2'
export const SOURCE_REFERRAL = '00000000-0000-4000-8000-0000000000a3'
export const SOURCE_GOOGLE = '00000000-0000-4000-8000-0000000000a4'
export const SOURCE_TRADE = '00000000-0000-4000-8000-0000000000a5'

export const sources: LeadLookup[] = [
  { id: SOURCE_WEBSITE, key: 'website', label: 'Website', sort_order: 1 },
  { id: SOURCE_PHONE, key: 'phone_call', label: 'Phone call', sort_order: 2 },
  { id: SOURCE_REFERRAL, key: 'referral', label: 'Referral', sort_order: 3 },
  { id: SOURCE_GOOGLE, key: 'google', label: 'Google', sort_order: 4 },
  { id: SOURCE_TRADE, key: 'trade_referral', label: 'Trade referral', sort_order: 5 },
]

export const employees: EmployeeSummary[] = [
  {
    id: '00000000-0000-4000-8000-0000000000f1',
    user_id: USER_JACOB,
    role: 'admin',
    enabled: true,
    name: 'Jacob',
  },
  {
    id: '00000000-0000-4000-8000-0000000000f2',
    user_id: USER_RENEE,
    role: 'admin',
    enabled: true,
    name: 'Renee',
  },
] as unknown as EmployeeSummary[]

export function lead(id: string, over: Partial<LeadView> = {}): LeadView {
  return {
    id,
    name: 'Dwight Okafor',
    phone: '+15125550307',
    email: 'd.okafor@gmail.com',
    created_at: ago(3 * DAY),
    updated_at: ago(3 * DAY),
    last_contacted: null,
    converted: false,
    contacted: false,
    responded: false,
    created_by: null,
    updated_by: null,
    notes: null,
    city: null,
    state: null,
    contact: null,
    priority: 'High',
    assigned_to_id: null,
    source: null,
    sms_consent_at: null,
    sms_consent_method: null,
    source_id: SOURCE_WEBSITE,
    contact_preference_id: null,
    number: 'LEAD-4471',
    contacted_at: null,
    responded_at: null,
    converted_at: null,
    archived_at: null,
    lead_stage: 'New',
    ...over,
  }
}

export const leads: LeadView[] = [
  lead(LEAD_A),
  lead(LEAD_B, {
    name: 'Celestine Marr',
    phone: '+14695550611',
    email: 'celestine@example.invalid',
    number: 'LEAD-4472',
    source_id: SOURCE_PHONE,
    assigned_to_id: USER_JACOB,
    lead_stage: 'Contacted',
    contacted: true,
    created_at: ago(6 * DAY),
  }),
  lead(LEAD_C, {
    name: 'Bartholomew Ng',
    phone: '+17135550288',
    email: null,
    number: 'LEAD-4473',
    source_id: SOURCE_REFERRAL,
    assigned_to_id: USER_RENEE,
    lead_stage: 'Contacted',
    contacted: true,
    created_at: ago(14 * DAY),
  }),
  lead(LEAD_D, {
    name: 'Inez Calloway',
    phone: '+12145550954',
    email: 'inez@example.invalid',
    number: 'LEAD-4474',
    source_id: SOURCE_GOOGLE,
    assigned_to_id: USER_JACOB,
    lead_stage: 'Converted',
    converted: true,
    created_at: ago(21 * DAY),
  }),
]

export const archivedLeads: LeadView[] = [
  lead('00000000-0000-4000-8000-0000000000aa', {
    name: 'Rasheed Bowman',
    number: 'LEAD-4400',
    archived_at: ago(2 * DAY),
    created_at: ago(30 * DAY),
  }),
]

export const totals: LeadEstimateTotal[] = [
  { lead_id: LEAD_A, total: 1240 },
  { lead_id: LEAD_B, total: 3860 },
  { lead_id: LEAD_D, total: 820 },
]

export const summary: LeadSummary = {
  totals: { count: 48, unowned: 6, median_hours_to_first_contact: 4 },
  response_rate_by_channel: { text: 0.71, call: 0.54, email: 0.38 },
  conversion: {
    rate: 0.15,
    target: 0.24,
    history: [
      { week_start: '2026-09-07', leads: 10, converted: 1, rate: 0.1 },
      { week_start: '2026-09-14', leads: 8, converted: 1, rate: 0.125 },
      { week_start: '2026-09-21', leads: 9, converted: 2, rate: 0.2222 },
      { week_start: '2026-09-28', leads: 7, converted: 1, rate: 0.1429 },
      { week_start: '2026-10-05', leads: 8, converted: 1, rate: 0.125 },
      { week_start: '2026-10-12', leads: 6, converted: 1, rate: 0.1667 },
    ],
  },
  first_contact: { median_hours: 4.2, target_hours: 4 },
  needs_attention: { unassigned: 6, not_contacted: 11, both: 4, total: 13 },
  counts_by_status: { new: 12, contacted: 20, converted: 16, archived: 3, all: 48 },
  response_rate: 0.62,
  deltas: {
    response_rate_pts: 6,
    conversion_rate_pts: 2,
    median_first_contact_minutes: -38,
    needs_attention: 3,
  },
}

export const activity: ActivityEntry[] = [
  {
    at: ago(12 * MINUTE),
    kind: 'lead_created',
    label: 'New lead',
    actor_id: '00000000-0000-4000-8000-0000000000b1',
    actor_name: 'Pedro Gonzalez',
    subject_kind: 'lead',
    subject_id: LEAD_A,
    subject_name: 'Maryam Shahrokhi',
    summary: 'Maryam Shahrokhi is a new lead',
  },
  {
    at: ago(4 * HOUR),
    kind: 'contacted',
    label: 'Contacted',
    actor_id: '00000000-0000-4000-8000-0000000000b2',
    actor_name: 'Dana Whitfield',
    subject_kind: 'lead',
    subject_id: LEAD_B,
    subject_name: 'Richard Meyer',
    summary: 'Richard Meyer was contacted',
  },
]

export const KIND_SCRAP = '00000000-0000-4000-8000-0000000000c1'
export const KIND_BULLION = '00000000-0000-4000-8000-0000000000c2'
export const UNIT_TROY = '00000000-0000-4000-8000-0000000000d1'
export const UNIT_G = '00000000-0000-4000-8000-0000000000d2'
export const UNIT_DWT = '00000000-0000-4000-8000-0000000000d3'
export const UNIT_LB = '00000000-0000-4000-8000-0000000000d4'
export const PURITY_14K = '00000000-0000-4000-8000-0000000000e4'
export const PURITY_18K = '00000000-0000-4000-8000-0000000000e5'
export const PURITY_925 = '00000000-0000-4000-8000-0000000000e6'
export const ITEM_1 = '00000000-0000-4000-8000-000000000101'
export const ITEM_2 = '00000000-0000-4000-8000-000000000102'
export const ITEM_3 = '00000000-0000-4000-8000-000000000103'
export const IMAGE_IN = '00000000-0000-4000-8000-000000000201'
export const IMAGE_OUT = '00000000-0000-4000-8000-000000000202'
export const IMAGE_RING_1 = '00000000-0000-4000-8000-000000000203'
export const IMAGE_RING_2 = '00000000-0000-4000-8000-000000000204'
export const IMAGE_NEW = '00000000-0000-4000-8000-000000000205'
export const CONTACT_TEXT = '00000000-0000-4000-8000-000000000301'
export const CONTACT_CALL = '00000000-0000-4000-8000-000000000302'
export const CONTACT_EMAIL = '00000000-0000-4000-8000-000000000303'

export const estimateKinds: LeadLookup[] = [
  { id: KIND_SCRAP, key: 'scrap', label: 'Scrap', sort_order: 1 },
  { id: KIND_BULLION, key: 'bullion', label: 'Bullion', sort_order: 2 },
]

export const weightUnits: WeightUnitLookup[] = [
  { id: UNIT_TROY, key: 'troy_oz', label: 'Troy Oz', grams: 31.1034768, sort_order: 1 },
  { id: UNIT_G, key: 'g', label: 'Grams', grams: 1, sort_order: 2 },
  { id: UNIT_DWT, key: 'dwt', label: 'DWT', grams: 1.55517384, sort_order: 3 },
  { id: UNIT_LB, key: 'lb', label: 'LBs', grams: 453.59237, sort_order: 4 },
]

export const purities: PurityLookup[] = [
  { id: PURITY_18K, metal_id: 'Gold', label: '18K', purity: 0.75, sort_order: 3 },
  { id: PURITY_14K, metal_id: 'Gold', label: '14K', purity: 0.5833, sort_order: 4 },
  { id: PURITY_925, metal_id: 'Silver', label: 'Sterling', purity: 0.925, sort_order: 2 },
]

export const contactPreferences: LeadLookup[] = [
  { id: CONTACT_TEXT, key: 'text', label: 'Text', sort_order: 1 },
  { id: CONTACT_CALL, key: 'call', label: 'Call', sort_order: 2 },
  { id: CONTACT_EMAIL, key: 'email', label: 'Email', sort_order: 3 },
]

const stamp = '2026-09-09T20:12:00.000Z'

export function item(id: string, over: Partial<EstimateItemView> = {}): EstimateItemView {
  return {
    id,
    lead_id: LEAD_A,
    kind_id: KIND_SCRAP,
    metal_id: 'Gold',
    weight: 12,
    unit_id: UNIT_G,
    purity_id: PURITY_14K,
    custom_purity: null,
    created_at: stamp,
    updated_at: stamp,
    created_by_id: null,
    updated_by_id: null,
    image_count: 0,
    grams: 12,
    total_grams: 241,
    ...over,
  }
}

export const items: EstimateItemView[] = [
  item(ITEM_1, { image_count: 2 }),
  item(ITEM_2, { weight: 8.4, grams: 8.4, purity_id: PURITY_18K }),
  item(ITEM_3, { metal_id: 'Silver', weight: 220, grams: 220, purity_id: PURITY_925 }),
]

export const estimate: LeadEstimate = {
  lead_id: LEAD_A,
  spots_at: '2026-10-19T16:55:00.000Z',
  items: [
    {
      id: ITEM_1,
      kind: 'Scrap',
      metal_id: 'Gold',
      purity: 0.585,
      content: 7.02,
      premium: 0.88,
      value: 1840,
    },
    {
      id: ITEM_2,
      kind: 'Scrap',
      metal_id: 'Gold',
      purity: 0.75,
      content: 6.3,
      premium: 0.9,
      value: 1610,
    },
    {
      id: ITEM_3,
      kind: 'Scrap',
      metal_id: 'Silver',
      purity: 0.925,
      content: 203.5,
      premium: 0.85,
      value: 750,
    },
  ],
  spot_states: [],
  unpriceable: [],
  total: 4199,
} as unknown as LeadEstimate

export const itemImages: EstimateItemImageView[] = [
  { image_id: IMAGE_RING_1, sort_order: 1, url: 'https://img.example/ring-1.jpg' },
  { image_id: IMAGE_RING_2, sort_order: 2, url: 'https://img.example/ring-2.jpg' },
]

export const timeline: LeadTimeline[] = [
  {
    at: '2026-09-10T01:12:00.000Z',
    kind: 'estimate',
    label: 'Estimate',
    actor_id: USER_JACOB,
    actor_name: 'Jacob Johnson',
    summary: 'Added estimate',
    detail: 'gold and silver scrap · 240 g',
  },
  {
    at: '2026-09-10T15:04:00.000Z',
    kind: 'call',
    label: 'Call',
    actor_id: USER_JACOB,
    actor_name: 'Jacob Johnson',
    summary: 'Outgoing call · no answer',
    detail: null,
  },
]

function sms(
  id: string,
  direction: 'inbound' | 'outbound',
  body: string | null,
  at: string,
  image_ids: string[] = [],
  images: { id: string; url: string }[] = []
): SmsThreadMessage {
  return {
    id,
    direction,
    provider: 'fake',
    provider_sid: `SM${id.slice(-4)}`,
    from_number: direction === 'inbound' ? '+15125550307' : '+15125550100',
    to_number: direction === 'inbound' ? '+15125550100' : '+15125550307',
    body,
    media: null,
    status: direction === 'inbound' ? 'received' : 'delivered',
    error_code: null,
    user_id: null,
    received_at: direction === 'inbound' ? at : null,
    sent_at: direction === 'outbound' ? at : null,
    created_at: at,
    updated_at: at,
    created_by_id: null,
    updated_by_id: null,
    read_at: null,
    image_ids,
    images,
  } as unknown as SmsThreadMessage
}

export const messages: SmsThreadMessage[] = [
  sms(
    '00000000-0000-4000-8000-000000000401',
    'outbound',
    'Hi Dwight, thanks for reaching out about your estate jewellery.',
    ago(3 * HOUR)
  ),
  sms(
    '00000000-0000-4000-8000-000000000402',
    'inbound',
    'Thanks! Roughly when should I expect the payout?',
    ago(2 * HOUR)
  ),
  sms(
    '00000000-0000-4000-8000-000000000403',
    'inbound',
    null,
    ago(90 * MINUTE),
    [IMAGE_IN],
    [{ id: IMAGE_IN, url: 'https://img.example/in.jpg' }]
  ),
  sms(
    '00000000-0000-4000-8000-000000000404',
    'outbound',
    'Here is the ring we discussed',
    ago(MINUTE * 60),
    [IMAGE_OUT],
    [{ id: IMAGE_OUT, url: 'https://img.example/out.jpg' }]
  ),
]

export const documents: LeadDocumentView[] = [
  {
    id: '00000000-0000-4000-8000-000000000501',
    lead_id: LEAD_A,
    pdf_id: '00000000-0000-4000-8000-000000000511',
    created_at: '2026-09-10T15:00:00.000Z',
    kind: 'rate_sheet',
    name: 'Rates Sheet',
    path: 'leads/rate-sheet.pdf',
    size_bytes: 98_304,
    checksum: 'abc',
    uploaded_at: '2026-09-10T15:00:00.000Z',
  },
  {
    id: '00000000-0000-4000-8000-000000000502',
    lead_id: LEAD_A,
    pdf_id: '00000000-0000-4000-8000-000000000512',
    created_at: '2026-09-10T15:00:00.000Z',
    kind: 'lead_document',
    name: 'Lead Document',
    path: 'leads/quote.pdf',
    size_bytes: 145_408,
    checksum: 'def',
    uploaded_at: '2026-09-10T15:00:00.000Z',
  },
] as unknown as LeadDocumentView[]

export function pageOf(rows: LeadView[], url: URL) {
  const sort = url.searchParams.get('sort') ?? 'created'
  const direction = url.searchParams.get('direction') ?? (sort === 'name' ? 'asc' : 'desc')
  const sign = direction === 'asc' ? 1 : -1
  const valueOf = (row: LeadView) => totals.find((t) => t.lead_id === row.id)?.total
  const sorted = [...rows].sort((a, b) => {
    if (sort === 'name') return sign * a.name.localeCompare(b.name)
    if (sort === 'estimated_value') {
      const x = valueOf(a)
      const y = valueOf(b)
      if (x === undefined || y === undefined) return x === y ? 0 : x === undefined ? 1 : -1
      return sign * (x - y)
    }
    return sign * (Date.parse(a.created_at) - Date.parse(b.created_at))
  })
  const size = Number(url.searchParams.get('page_size') ?? sorted.length)
  const page = Number(url.searchParams.get('page') ?? 1)
  return { rows: sorted.slice((page - 1) * size, page * size), total: rows.length }
}

export type Reply = { status: number; body: unknown } | { pending: true }
export type Routes = Record<string, unknown | ((url: URL, body: unknown) => unknown)>

export const fail = (status: number, message = 'failed'): Reply => ({
  status,
  body: { message },
})
export const pending = (): Reply => ({ pending: true })

const isReply = (value: unknown): value is Reply =>
  !!value &&
  typeof value === 'object' &&
  ('pending' in value || ('status' in value && 'body' in value && Object.keys(value).length === 2))

export type Call = { method: string; url: URL; body: unknown }

export function stubApi(routes: Routes) {
  const calls: Call[] = []
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const method = init?.method ?? 'GET'
    const body =
      init?.body instanceof FormData
        ? init.body
        : init?.body instanceof Blob
          ? init.body
          : init?.body
            ? JSON.parse(String(init.body))
            : undefined
    calls.push({ method, url, body })
    const key = `${method} ${url.pathname.replace(/^\/api/, '')}`
    const hit = Object.entries(routes).find(([pattern]) => pattern === key)
    if (!hit)
      return new Response(JSON.stringify({ message: `not stubbed: ${key}` }), { status: 404 })
    const value =
      typeof hit[1] === 'function' ? (hit[1] as (u: URL, b: unknown) => unknown)(url, body) : hit[1]
    if (isReply(value)) {
      if ('pending' in value) return new Promise<Response>(() => {})
      return new Response(JSON.stringify(value.body), { status: value.status })
    }
    return new Response(JSON.stringify(value ?? null), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return calls
}

export const callsTo = (calls: Call[], method: string, path: string) =>
  calls.filter((c) => c.method === method && c.url.pathname.replace(/^\/api/, '') === path)

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

export async function choose(label: string | RegExp, option: string | RegExp, scope?: HTMLElement) {
  const root = scope ? within(scope) : screen
  const combobox = root.getByRole('combobox', { name: label })
  fireEvent.keyDown(combobox, { key: 'Enter' })
  fireEvent.keyDown(await screen.findByRole('option', { name: option }), { key: 'Enter' })
}

export function pick(scope: HTMLElement, name: string | RegExp): HTMLElement {
  const box = within(scope)
  return (
    box.queryByRole('radio', { name }) ??
    box.queryByRole('checkbox', { name }) ??
    box.getByRole('button', { name })
  )
}

export function fileInput(scope: HTMLElement | Document = document): HTMLInputElement {
  const input = scope.querySelector('input[type="file"]')
  if (!input) throw new Error('no file input on screen')
  return input as HTMLInputElement
}

export const png = () => new File(['png-bytes'], 'ring.png', { type: 'image/png' })

export const uploadRoutes = (): Routes => ({
  'POST /images': { id: IMAGE_NEW, uploadUrl: 'http://localhost/upload/ring.png?sig=1' },
  'PUT /upload/ring.png': '',
})
