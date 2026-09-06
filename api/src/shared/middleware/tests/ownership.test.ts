import { test } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { requireOwnShipment } from '#shared/middleware/ownership.ts'
import { aUser, anOrder, aShipment } from '#shared/testing/builders/index.ts'

type GuardResult = { refused: boolean; code?: number }

const runGuard = (
  user: { id: string; role: string } | null,
  req: { params?: Record<string, unknown>; body?: unknown; query?: Record<string, unknown> }
): Promise<GuardResult> =>
  new Promise((resolve) => {
    let code: number | undefined
    const res = {
      status(status: number) {
        code = status
        return res
      },
      json() {
        resolve({ refused: true, code })
      },
    }
    requireOwnShipment(
      { user, ...req } as unknown as Parameters<typeof requireOwnShipment>[0],
      res as unknown as Parameters<typeof requireOwnShipment>[1],
      () => resolve({ refused: false })
    )
  })

test('a shipment of my own in the QUERY does not unlock a victim named in the path', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const victim = await aUser(c)
      const attacker = await aUser(c)
      const theirs = await aShipment(c, await anOrder(c, victim, { direction: 'purchase' }))
      const mine = await aShipment(c, await anOrder(c, attacker, { direction: 'purchase' }))

      const result = await runGuard(
        { id: attacker.id, role: 'user' },
        { params: { id: theirs.id }, query: { shipment_id: mine.id } }
      )
      assert.deepEqual(
        result,
        { refused: true, code: 403 },
        'GET /api/shipments/<victim>?shipment_id=<mine> passed the guard; the ' +
          'handler reads the path parameter, so the victim shipment was served'
      )
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS, LOCKS.USERS] }
  )
})

test('a shipment of my own in the BODY does not unlock a victim named in the path', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const victim = await aUser(c)
      const attacker = await aUser(c)
      const theirs = await aShipment(c, await anOrder(c, victim, { direction: 'purchase' }))
      const mine = await aShipment(c, await anOrder(c, attacker, { direction: 'purchase' }))

      assert.deepEqual(
        await runGuard(
          { id: attacker.id, role: 'user' },
          { params: { id: theirs.id }, body: { shipment_id: mine.id } }
        ),
        { refused: true, code: 403 },
        'express.json() parses a GET body too, so the body is the same trick'
      )
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS, LOCKS.USERS] }
  )
})

test('the two routes the guard serves each still work on their own subject', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const owner = await aUser(c)
      const shipment = await aShipment(c, await anOrder(c, owner, { direction: 'purchase' }))

      assert.deepEqual(
        await runGuard({ id: owner.id, role: 'user' }, { params: { id: shipment.id } }),
        { refused: false },
        'GET /api/shipments/:id resolves its subject from the path'
      )
      assert.deepEqual(
        await runGuard({ id: owner.id, role: 'user' }, { body: { shipment_id: shipment.id } }),
        { refused: false },
        'POST /api/shipping/get_tracking resolves its subject from the body'
      )
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS, LOCKS.USERS] }
  )
})

test('a subject that is not a uuid is refused rather than raising 22P02', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const owner = await aUser(c)
      assert.deepEqual(
        await runGuard({ id: owner.id, role: 'user' }, { params: { id: 'not-a-uuid' } }),
        { refused: true, code: 403 }
      )
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS, LOCKS.USERS] }
  )
})

test('naming nothing is a 400, and an unauthenticated caller a 401', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const owner = await aUser(c)
      assert.deepEqual(await runGuard({ id: owner.id, role: 'user' }, {}), {
        refused: true,
        code: 400,
      })
      assert.deepEqual(await runGuard(null, { params: { id: 'x' } }), { refused: true, code: 401 })
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS, LOCKS.USERS] }
  )
})
