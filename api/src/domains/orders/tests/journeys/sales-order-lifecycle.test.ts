import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, asAdmin } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser, anAdmin, anOrder } from '#shared/testing/builders/index.ts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

test('the real cancel endpoint is purchase-only: a sales order is refused, not charged', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const admin = await anAdmin(c)
      const buyer = await aUser(c)
      const order = await anOrder(c, buyer, { direction: 'sale' })

      const cancelled = await asAdmin(admin, () =>
        request(app).post(`/api/orders/${order.id}/cancel`).send({
          carrier_service_id: '00000000-0000-4000-8000-000000000000',
          package_id: '00000000-0000-4000-8000-000000000000',
        })
      )
      assert.equal(cancelled.status, 422, cancelled.text)
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})
