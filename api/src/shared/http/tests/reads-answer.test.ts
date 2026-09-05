import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as } from '#shared/testing/session.ts'
import { TEST_ACTOR, TEST_CUSTOMER } from '#shared/testing/actor.ts'
import { inPinnedTransaction, outside } from '#shared/testing/pinned-pool.ts'

await mockSessions()
const { default: app } = await import('#app')

type UserRow = { id: string; name: string | null; email: string | null }

let admin: UserRow
let customer: UserRow

beforeAll(async () => {
  admin = TEST_ACTOR
  customer = TEST_CUSTOMER
  assert.ok(admin && customer, 'dev needs an admin and a non-admin user')
})

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const READS = [
  ['public', '/api/products?side=bid'],
  ['public', '/api/products?placement=homepage'],
  ['public', '/api/products?metal=Gold&sort=content'],
  ['admin', '/api/products/admin'],
  ['admin', '/api/metals'],
  ['admin', '/api/mints'],
  ['admin', '/api/products/types'],
  ['user', '/api/checkout/items?direction=sale'],
  ['admin', '/api/fulfillments/methods/all'],
  ['admin', '/api/fulfillments/schedule'],
  ['user', '/api/orders'],
]

for (const [who, url] of READS) {
  test(`${url} answers as ${who}`, async () => {
    await inPinnedTransaction(
      async () => {
        const call = async () => {
          const res = await request(app).get(url)
          assert.ok(
            res.status < 500,
            `${url} answered ${res.status}: ${JSON.stringify(res.body).slice(0, 200)}`
          )
          const body = JSON.stringify(res.body ?? '')
          for (const smell of ['is not a function', 'is not defined', 'Cannot read properties']) {
            assert.ok(!body.includes(smell), `${url} failed structurally: ${smell}`)
          }
        }

        if (who === 'public') return call()
        const role = who === 'admin' ? 'admin' : 'user'
        const person = who === 'admin' ? admin : customer
        await as({ ...person, role }, call)
      },
      { actor: TEST_ACTOR.id }
    )
  })
}
