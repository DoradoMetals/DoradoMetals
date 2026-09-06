// WHAT THE REFINING HOOKS PUT ON THE WIRE.
//
// This file pinned `PATCH /refiners/orders/:id` and
// `PATCH /refiners/items/by-order-item/:id` - the per-customer-order refiner
// ENGAGEMENT. The lots lane deleted both tables' code (docs/waves/lots-build.md):
// a refining order is the business's own order to a counterparty now, with its
// own id, and no foreign key joins it to a customer order (ruling 42). So the
// URLs moved to `/refining/orders/:id` and `/refining/lots/:id`, and the bodies
// with them.
//
// What is pinned is unchanged in kind: the body is exactly what the endpoint's
// strict contract accepts, and a field the API would refuse by name is refused
// here first.
import { describe, expect, test, afterEach } from 'vitest'
import { RefiningLotPatch, RefiningOrderPatch } from '@dorado/contracts'

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

const REFINING_ORDER_ID = '9f1c2b3a-0000-4000-8000-000000000051'
const REFINING_LOT_ID = '9f1c2b3a-0000-4000-8000-000000000053'
const ASSIGNEE_ID = '9f1c2b3a-0000-4000-8000-000000000054'

describe('usePatchRefiningOrder sends exactly what PATCH /refining/orders/:id accepts', () => {
  test('the settlement fields parse, and a spots array is refused', async () => {
    captures()
    await apiRequest('PATCH', `/refining/orders/${REFINING_ORDER_ID}`, {
      fee: 125.5,
      assay_lab: 'Elemetal',
      assigned_to_id: ASSIGNEE_ID,
    })

    expect(RefiningOrderPatch.safeParse(lastBody).success).toBe(true)

    // `refiners.spots` died with the engagement: a refiner's ounces are valued
    // at the pool's most recent lock price now, so a spots array on this patch
    // is a shape the API no longer has.
    const poisoned = { ...(lastBody as object), spots: [{ metal_id: 'Gold', bid: 1990 }] }
    expect(RefiningOrderPatch.safeParse(poisoned).success).toBe(false)
  })
})

describe('usePatchRefiningLot sends exactly what PATCH /refining/lots/:id accepts', () => {
  test('assay figures parse clean, and content is refused by the contract', async () => {
    captures()
    await apiRequest('PATCH', `/refining/lots/${REFINING_LOT_ID}`, {
      purity: 0.585,
      post_melt: 4.2,
    })

    expect(RefiningLotPatch.safeParse(lastBody).success).toBe(true)

    // Content is GENERATED in the database from the weights and the purity
    // (migration 160), so no caller may name it.
    const poisoned = { ...(lastBody as object), content: 2.4 }
    expect(RefiningLotPatch.safeParse(poisoned).success).toBe(false)
  })
})
