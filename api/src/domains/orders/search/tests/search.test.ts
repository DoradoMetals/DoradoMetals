import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as, asAdmin, anonymous } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser, anOrder, aProduct, aLead } from '#shared/testing/builders/index.ts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const inOrders = <T>(fn: (c: PoolClient) => Promise<T>) =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.USERS] })

type Hit = { kind: string; id: string; reference: string; title: string }

test('the search is admin-only, and refuses a query too short to be one', async () => {
  await inOrders(async (c) => {
    const customer = await aUser(c)

    await anonymous(async () => {
      const res = await request(app).get('/api/search').query({ q: 'whatever' })
      assert.ok([401, 403].includes(res.status), `answered ${res.status} with no session`)
    })

    await as({ ...customer, role: 'user' }, async () => {
      const res = await request(app).get('/api/search').query({ q: 'whatever' })
      assert.equal(res.status, 403, `a customer was answered ${res.status}`)
    })

    await asAdmin(TEST_ACTOR, async () => {
      const short = await request(app).get('/api/search').query({ q: 'a' })
      assert.equal(short.status, 400, `a one-character search answered ${short.status}`)
      const missing = await request(app).get('/api/search')
      assert.equal(missing.status, 400, `an unnamed search answered ${missing.status}`)
    })
  })
})

test('one query returns flat typed hits across orders, customers, leads and lots', async () => {
  await inOrders(async (c) => {
    const customer = await aUser(c)
    const product = await aProduct(c, { metal_id: 'Gold', content: 1 })
    const order = await anOrder(c, customer, { direction: 'purchase' }).withBullion(product, 1)

    await asAdmin(TEST_ACTOR, async () => {
      const byNumber = await request(app)
        .get('/api/search')
        .query({ q: `PO-${order.number}` })
      assert.equal(byNumber.status, 200, byNumber.text)
      const hits: Hit[] = byNumber.body
      const hit = hits.find((row) => row.kind === 'order' && row.id === order.id)
      assert.ok(hit, 'the order is missing from a search for its own reference')
      assert.equal(hit.reference, `PO-${order.number}`)
      assert.equal(hit.title, customer.name ?? customer.email)

      const lot = hits.find((row) => row.kind === 'lot' && row.id === order.lots[0]!.lot_id)
      assert.ok(lot, 'the order number did not reach the lots on that order')
      assert.equal(lot.reference, `Lot ${order.number}-A`)
      assert.equal(lot.title, product.name)

      for (const row of hits) {
        assert.deepEqual(
          Object.keys(row).sort(),
          ['id', 'kind', 'reference', 'title'],
          'a hit carries more than the four flat fields'
        )
      }
    })
  })
})

test('a customer and a lead are found by the start of their name', async () => {
  await inOrders(async (c) => {
    const customer = await aUser(c)
    const lead = await aLead(c, { name: `Marguerite ${customer.id.slice(0, 8)}` })

    await asAdmin(TEST_ACTOR, async () => {
      const byEmail = await request(app)
        .get('/api/search')
        .query({ q: customer.email.slice(0, 12) })
      assert.equal(byEmail.status, 200, byEmail.text)
      assert.ok(
        byEmail.body.some((row: Hit) => row.kind === 'customer' && row.id === customer.id),
        'a customer was not found by the start of their email'
      )

      const byName = await request(app).get('/api/search').query({ q: 'Marguerite' })
      assert.equal(byName.status, 200, byName.text)
      assert.ok(
        byName.body.some((row: Hit) => row.kind === 'lead' && row.id === lead.id),
        'a lead was not found by the start of its name'
      )
    })
  })
})
