// AN IN-MEMORY /checkout/items, for component tests.
//
// The basket stopped being a browser store at ruling 63: a card's add button
// PUTs the whole basket and renders what the server answers. So a render test
// that used to read `useCheckoutItems.getState().sale` now has to have a
// server to read - and stubbing `fetch` is what makes the REAL hooks, the real
// query cache and the real line arithmetic run, rather than a mocked feature
// module that would prove only that the mock works.
//
// It answers the two verbs the cards use and nothing else; anything else 404s
// loudly rather than resolving to an empty object a test could pass against.
import { vi } from 'vitest'
import type { CheckoutItemPatch } from '@dorado/contracts'

export type Direction = 'sale' | 'purchase'

type Row = CheckoutItemPatch & { id: string }

export type CheckoutServer = {
  baskets: Record<Direction, Row[]>
  /** What is in a basket, for an assertion. */
  lines: (direction: Direction) => Row[]
  /** Seed a basket before the render. */
  seed: (direction: Direction, items: CheckoutItemPatch[]) => void
}

const json = (body: unknown, status = 200): Response =>
  ({
    ok: status < 400,
    status,
    text: async () => JSON.stringify(body),
  }) as Response

export function stubCheckoutServer(): CheckoutServer {
  const baskets: Record<Direction, Row[]> = { sale: [], purchase: [] }
  let next = 0
  const store = (direction: Direction, items: CheckoutItemPatch[]): Row[] => {
    baskets[direction] = items.map((item) => ({ ...item, id: `row-${(next += 1)}` }))
    return baskets[direction]
  }

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(String(input), 'http://test.local')
      const direction = (url.searchParams.get('direction') ?? 'sale') as Direction
      const method = init?.method ?? 'GET'

      if (url.pathname.endsWith('/checkout/items')) {
        if (method === 'GET') return json(baskets[direction])
        if (method === 'PUT') {
          const body = JSON.parse(String(init?.body ?? '{}')) as { items: CheckoutItemPatch[] }
          return json(store(direction, body.items ?? []))
        }
        if (method === 'DELETE') {
          const removed = baskets[direction].length
          baskets[direction] = []
          return json({ removed })
        }
      }
      if (url.pathname.endsWith('/checkout') && method === 'GET') {
        return json({ id: 'checkout-1', direction, missing: [] })
      }
      return json({ message: `no stub for ${method} ${url.pathname}` }, 404)
    })
  )

  return {
    baskets,
    lines: (direction) => baskets[direction],
    seed: (direction, items) => {
      store(direction, items)
    },
  }
}
