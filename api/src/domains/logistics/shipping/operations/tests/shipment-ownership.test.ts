import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as, anonymous } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { requireOwnShipment } from '#shared/middleware/ownership.ts'
import { anUnknownId, aUser, anOrder, aShipment } from '#shared/testing/builders/index.ts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

test("a customer cannot ask about another customer's shipment", async () => {
  await inPinnedTransaction(
    async () => {
      await as(
        { id: anUnknownId(), name: 'Stranger', email: 'stranger@dorado.test', role: 'user' },
        async () => {
          const res = await request(app)
            .post('/api/shipping/get_tracking')
            .send({ shipment_id: anUnknownId() })

          assert.equal(res.status, 403, `a stranger was answered ${res.status}`)
        }
      )
    },
    { actor: TEST_ACTOR.id }
  )
})

test('an anonymous caller cannot ask about a shipment', async () => {
  await inPinnedTransaction(
    async () => {
      await anonymous(async () => {
        const res = await request(app)
          .post('/api/shipping/get_tracking')
          .send({ shipment_id: anUnknownId() })

        assert.ok([401, 403].includes(res.status), `anonymous was answered ${res.status}`)
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('a request naming no shipment is refused rather than waved through', async () => {
  await inPinnedTransaction(
    async () => {
      await as(
        { id: anUnknownId(), name: 'Stranger', email: 'stranger@dorado.test', role: 'user' },
        async () => {
          const res = await request(app).post('/api/shipping/get_tracking').send({})
          assert.equal(res.status, 400, `a request with no shipment was answered ${res.status}`)
        }
      )
    },
    { actor: TEST_ACTOR.id }
  )
})

type GuardResult = { refused: boolean; code?: number }

const runGuard = (
  user: { id: string; role: string } | null,
  body: Record<string, unknown>
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
      { user, body } as unknown as Parameters<typeof requireOwnShipment>[0],
      res as unknown as Parameters<typeof requireOwnShipment>[1],
      () => resolve({ refused: false })
    )
  })

test('the owner is allowed through, and an admin is allowed through', async () => {
  await inPinnedTransaction(
    async (c) => {
      const owner = await aUser(c)
      const stranger = await aUser(c)
      const order = await anOrder(c, owner, { direction: 'purchase' })
      const shipment = await aShipment(c, order)

      assert.deepEqual(
        await runGuard({ id: owner.id, role: 'user' }, { shipment_id: shipment.id }),
        { refused: false },
        "the shipment's own customer was refused"
      )

      assert.deepEqual(
        await runGuard({ id: stranger.id, role: 'admin' }, { shipment_id: shipment.id }),
        { refused: false },
        'an admin was refused'
      )

      const denied = await runGuard({ id: stranger.id, role: 'user' }, { shipment_id: shipment.id })
      assert.equal(denied.refused, true, 'a stranger was allowed through')
      assert.equal(denied.code, 403)
    },
    { actor: TEST_ACTOR.id }
  )
})
