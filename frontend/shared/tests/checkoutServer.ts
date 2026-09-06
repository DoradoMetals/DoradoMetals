// AN IN-MEMORY /checkout/lots, for component tests.
//
// The basket stopped being a browser store at ruling 63: a card's add button
// PUTs the whole basket and renders what the server answers. So a render test
// that used to read `useCheckoutItems.getState().sale` now has to have a
// server to read - and stubbing `fetch` is what makes the REAL hooks, the real
// query cache and the real line arithmetic run, rather than a mocked feature
// module that would prove only that the mock works.
//
// A BASKET LINE IS A LOT (docs/waves/lots-build.md): the endpoint is
// `/checkout/lots`, the PUT body key is `lots`, and a row is a `lots.items`
// row rather than a `checkout.items` one.
//
// It answers the two verbs the cards use and nothing else; anything else 404s
// loudly rather than resolving to an empty object a test could pass against.
import { vi } from 'vitest'
import type { CheckoutLotPatch } from '@dorado/contracts'

export type Direction = 'sale' | 'purchase'

type Row = CheckoutLotPatch & { id: string }

export type CheckoutServer = {
  baskets: Record<Direction, Row[]>
  /** What is in a basket, for an assertion. */
  lines: (direction: Direction) => Row[]
  /** Seed a basket before the render. */
  seed: (direction: Direction, lots: CheckoutLotPatch[]) => void
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
  const store = (direction: Direction, lots: CheckoutLotPatch[]): Row[] => {
    baskets[direction] = lots.map((lot) => ({ ...lot, id: `row-${(next += 1)}` }))
    return baskets[direction]
  }

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(String(input), 'http://test.local')
      const direction = (url.searchParams.get('direction') ?? 'sale') as Direction
      const method = init?.method ?? 'GET'

      if (url.pathname.endsWith('/checkout/lots')) {
        if (method === 'GET') return json(baskets[direction])
        if (method === 'PUT') {
          const body = JSON.parse(String(init?.body ?? '{}')) as { lots: CheckoutLotPatch[] }
          return json(store(direction, body.lots ?? []))
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
    seed: (direction, lots) => {
      store(direction, lots)
    },
  }
}
