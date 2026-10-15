import { vi } from 'vitest'
import type { OrderListItem } from '@dorado/contracts'

export const ID_A = '00000000-0000-4000-8000-00000000000a'
export const ID_B = '00000000-0000-4000-8000-00000000000b'
export const ID_C = '00000000-0000-4000-8000-00000000000c'

export const action = (name: string) => ({ name, confirm: null, override: null })

export const item = (
  id: string,
  number: number,
  actions: string[],
  over: Partial<OrderListItem> = {}
): OrderListItem =>
  ({
    id,
    direction: 'purchase',
    number,
    reference: `PO-${number}`,
    state: 'Awaiting Receipt',
    customer: { id: ID_C, name: 'Marguerite Whitfield', email: 'm@example.invalid' },
    lots: [
      {
        lot_id: ID_C,
        product_name: '14K Gold',
        weight: 210.5,
        unit: 'g',
        purity: 0.417,
        reference: `${number}-A`,
        form: 'Scrap',
        destination: null,
      },
    ],
    lot_count: 3,
    more_count: 2,
    estimated_value: 18420,
    arrived_at: '2026-09-02T15:07:00Z',
    placed_at: '2026-09-02T15:07:00Z',
    actions: actions.map(action),
    ...over,
  }) as unknown as OrderListItem

export type Routes = Record<string, unknown | ((url: URL) => unknown)>

export function stubApi(routes: Routes) {
  const calls: { method: string; url: URL; body: unknown }[] = []
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const method = init?.method ?? 'GET'
    calls.push({
      method,
      url,
      body:
        init?.body instanceof FormData
          ? 'form'
          : init?.body
            ? JSON.parse(String(init.body))
            : undefined,
    })
    const key = `${method} ${url.pathname.replace(/^\/api/, '')}`
    const hit = Object.entries(routes).find(([pattern]) => pattern === key)
    if (!hit) return new Response('not stubbed', { status: 404 })
    const body = typeof hit[1] === 'function' ? (hit[1] as (u: URL) => unknown)(url) : hit[1]
    return new Response(JSON.stringify(body), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return calls
}

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
