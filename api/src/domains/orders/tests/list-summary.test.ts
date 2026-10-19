import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as, anonymous } from '#shared/testing/session.ts'
import { TEST_ACTOR, TEST_CUSTOMER } from '#shared/testing/actor.ts'
import { aUser, anOrder } from '#shared/testing/builders/index.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { OrderListSummary } from '@dorado/contracts'

// GET /api/orders/summary is the totals line under the Orders list title. It
// takes the direction and nothing else: the line never moves with the filters,
// while the list read's counts.orders (the "N matching" beside Reset) does.

await mockSessions()
const { default: app } = await import('#app')

const admin = { ...TEST_ACTOR, role: 'admin' }
const customer = { ...TEST_CUSTOMER, role: 'user' }

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const stateCount = (summary: OrderListSummary, state: string) =>
  summary.states.find((row) => row.state === state)?.count ?? 0

test('the summary counts every order of the direction by state, and ignores list filters', async () => {
  await inPinnedTransaction(
    async (c) => {
      await as(admin, async () => {
        const before = OrderListSummary.parse(
          (await request(app).get('/api/orders/summary?direction=purchase').expect(200)).body
        )
        const saleBefore = OrderListSummary.parse(
          (await request(app).get('/api/orders/summary?direction=sale').expect(200)).body
        )

        const owner = await aUser(c)
        const open = await anOrder(c, owner, { direction: 'purchase' })
        const cancelled = await anOrder(c, owner, { direction: 'purchase' })
        await c.query(`UPDATE orders.orders SET cancelled_at = now() WHERE id = $1`, [cancelled.id])
        await c.query(`UPDATE orders.orders SET assigned_to_id = $1 WHERE id = $2`, [
          TEST_ACTOR.id,
          open.id,
        ])

        const res = await request(app).get(
          `/api/orders/summary?direction=purchase&state=Cancelled&assigned_to_id=${TEST_ACTOR.id}`
        )
        assert.equal(res.status, 200)
        const after = OrderListSummary.parse(res.body)

        assert.equal(after.orders, before.orders + 2, 'a list filter narrowed the summary')
        assert.equal(stateCount(after, 'Cancelled'), stateCount(before, 'Cancelled') + 1)
        assert.equal(
          after.states.reduce((sum, row) => sum + row.count, 0),
          after.orders,
          'the states do not add up to the orders'
        )

        const sale = OrderListSummary.parse(
          (await request(app).get('/api/orders/summary?direction=sale').expect(200)).body
        )
        assert.equal(sale.orders, saleBefore.orders, 'a purchase moved the sale summary')
      })
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})

test('the summary is admin only and refuses an unknown direction', async () => {
  await inPinnedTransaction(
    async () => {
      await anonymous(async () => {
        const res = await request(app).get('/api/orders/summary?direction=purchase')
        assert.ok([401, 403].includes(res.status), `answered ${res.status}`)
      })
      await as(customer, async () => {
        const res = await request(app).get('/api/orders/summary?direction=purchase')
        assert.equal(res.status, 403)
      })
      await as(admin, async () => {
        const res = await request(app).get('/api/orders/summary?direction=sideways')
        assert.equal(res.status, 400)
      })
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})
