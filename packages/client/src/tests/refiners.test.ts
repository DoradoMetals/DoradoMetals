import { describe, expect, test, afterEach } from 'vitest'
import { RefinerItemPatch, RefinerOrderPatch } from '@dorado/contracts'

import { apiRequest } from '../fetch'

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

let lastBody: unknown = null

function captures() {
  lastBody = null
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    lastBody = init?.body ? JSON.parse(String(init.body)) : null
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as unknown as typeof fetch
}

const REFINER_ORDER_ID = '9f1c2b3a-0000-4000-8000-000000000051'
const ORDER_ITEM_ID = '9f1c2b3a-0000-4000-8000-000000000053'
const METAL_ID = '9f1c2b3a-0000-4000-8000-000000000054'

describe('usePatchRefinerOrder sends exactly what PATCH /refiners/orders/:id accepts', () => {
  test('a spot write names metal_id, never name', async () => {
    captures()
    await apiRequest('PATCH', `/refiners/orders/${REFINER_ORDER_ID}`, {
      spots: [{ metal_id: METAL_ID, bid: 1990 }],
    })

    expect(RefinerOrderPatch.strict().safeParse(lastBody).success).toBe(true)
    const body = lastBody as { spots: Record<string, unknown>[] }
    expect(body.spots[0]).toEqual({ metal_id: METAL_ID, bid: 1990 })
    expect(body.spots[0]).not.toHaveProperty('name')

    const poisoned = { spots: [{ name: 'Gold', bid: 1990 }] }
    expect(RefinerOrderPatch.strict().safeParse(poisoned).success).toBe(false)
  })
})

describe('usePatchRefinerItem sends exactly what PATCH /refiners/items/by-order-item/:id accepts', () => {
  test('assay figures parse clean, and content is refused by the contract', async () => {
    captures()
    await apiRequest('PATCH', `/refiners/items/by-order-item/${ORDER_ITEM_ID}`, {
      purity: 0.585,
      post_melt: 4.2,
    })

    expect(RefinerItemPatch.strict().safeParse(lastBody).success).toBe(true)

    const poisoned = { ...(lastBody as object), content: 2.4 }
    expect(RefinerItemPatch.strict().safeParse(poisoned).success).toBe(false)
  })
})
