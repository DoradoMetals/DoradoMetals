import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aProduct, aUser } from '#shared/testing/builders/index.ts'
import * as lots from '#db/inventory/lots/repo.ts'
import { OrderPreview, OrderPreviewBody } from '@dorado/contracts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const admin = { ...TEST_ACTOR, role: 'admin' }
const inPricing = <T>(fn: (c: PoolClient) => Promise<T>) =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.USERS] })

const PREVIEW = '/api/pricing/preview'
const scrap = { metal_id: 'Gold', pre_melt: 10, purity: 0.5, unit: 't oz' }
const near = (actual: number, expected: number, what: string) =>
  assert.ok(Math.abs(actual - expected) <= 0.011, `${what}: ${actual} is not ${expected}`)

const preview = (body: object) => as(admin, () => request(app).post(PREVIEW).send(body))

const countLots = async (c: PoolClient): Promise<number> => {
  const { rows } = await c.query<{ n: number }>('SELECT count(*)::int AS n FROM inventory.lots')
  return rows[0]!.n
}

test('the preview body is one of three kinds and takes ids plus lot inputs only', () => {
  const user_id = TEST_ACTOR.id
  assert.equal(
    OrderPreviewBody.safeParse({ kind: 'customer_purchase', user_id, lots: [scrap] }).success,
    true
  )
  assert.equal(
    OrderPreviewBody.safeParse({ kind: 'customer_sale', user_id, lots: [] }).success,
    true
  )
  assert.equal(
    OrderPreviewBody.safeParse({ kind: 'refiner_sale', lot_ids: [user_id] }).success,
    true
  )
  assert.equal(
    OrderPreviewBody.safeParse({
      kind: 'customer_purchase',
      user_id,
      lots: [{ ...scrap, price: 1 }],
    }).success,
    false,
    'a price is never an input'
  )
  assert.equal(
    OrderPreviewBody.safeParse({ kind: 'refiner_purchase', lot_ids: [] }).success,
    false,
    'a Refiner Purchase has nothing to price'
  )
})

test('a purchase preview returns the spot, fine content, metal value, premium and total per lot and overall', async () => {
  await inPricing(async (c) => {
    const customer = await aUser(c)
    const before = await countLots(c)

    const res = await preview({
      kind: 'customer_purchase',
      user_id: customer.id,
      lots: [{ ...scrap, premium: 0.5 }, { ...scrap }],
    })
    assert.equal(res.status, 200, res.text)
    const body = OrderPreview.parse(res.body)

    assert.equal(body.kind, 'customer_purchase')
    assert.equal(body.lines.length, 2)
    assert.deepEqual(
      body.lines.map((line) => line.position),
      [0, 1]
    )
    const [override, rated] = body.lines
    assert.equal(override!.premium, 0.5, 'the admin override reaches the preview')
    assert.ok(rated!.premium > 0 && rated!.premium !== 0.5, 'an absent premium is the rate')

    for (const line of body.lines) {
      assert.equal(line.metal_id, 'Gold')
      near(line.fine_oz, 5, 'fine content')
      const spot = body.spots.find((s) => s.metal_id === 'Gold')
      assert.ok(spot, 'the spot the preview priced at is returned')
      assert.equal(line.spot, spot.spot)
      near(line.metal_value, line.fine_oz * line.spot, 'metal value')
      near(line.total, line.metal_value * line.premium, 'line total')
    }
    near(
      body.metal_value,
      body.lines.reduce((sum, line) => sum + line.metal_value, 0),
      'metal value overall'
    )
    near(
      body.total,
      body.lines.reduce((sum, line) => sum + line.total, 0),
      'total'
    )
    near(body.fine_oz.find((f) => f.metal_id === 'Gold')?.oz ?? 0, 10, 'fine content overall')
    assert.equal(body.credit_applied, 0)
    near(body.total_due, body.total, 'a purchase owes the customer its total')

    assert.equal(await countLots(c), before, 'a preview wrote a lot')
  })
})

test('an empty basket previews to zero', async () => {
  await inPricing(async (c) => {
    const customer = await aUser(c)
    const res = await preview({ kind: 'customer_purchase', user_id: customer.id, lots: [] })
    assert.equal(res.status, 200, res.text)
    const body = OrderPreview.parse(res.body)
    assert.equal(body.lines.length, 0)
    assert.equal(body.total, 0)
  })
})

test('a sale preview applies the customer credit, as placement will', async () => {
  await inPricing(async (c) => {
    const customer = await aUser(c, { funds: 100 })
    const product = await aProduct(c, { metal_id: 'Gold', content: 1, ask_premium: 1.02 })

    const res = await preview({
      kind: 'customer_sale',
      user_id: customer.id,
      lots: [{ bullion_id: product.id, quantity: 2, premium: 1.035 }],
    })
    assert.equal(res.status, 200, res.text)
    const body = OrderPreview.parse(res.body)
    assert.equal(body.lines[0]!.premium, 1.035)
    near(body.lines[0]!.fine_oz, 2, 'two one-ounce coins')
    near(body.credit_applied, 100, 'credit applied')
    near(body.total_due, body.total - 100, 'due after credit')
  })
})

test('a Refiner Sale preview prices the selected on-hand lots', async () => {
  await inPricing(async (c) => {
    const lot = await lots.create({ metal_id: 'Gold', pre_melt: 5, purity: 0.9 }, c)
    const res = await preview({ kind: 'refiner_sale', lot_ids: [lot.id] })
    assert.equal(res.status, 200, res.text)
    const body = OrderPreview.parse(res.body)
    assert.equal(body.lines.length, 1)
    assert.equal(body.lines[0]!.lot_id, lot.id)
    assert.ok(body.lines[0]!.fine_oz > 0)
    assert.ok(body.total > 0)
  })
})

test('the preview is staff-only', async () => {
  await inPricing(async (c) => {
    const customer = await aUser(c)
    const res = await as({ ...customer, role: 'user' }, () =>
      request(app).post(PREVIEW).send({ kind: 'customer_purchase', user_id: customer.id, lots: [] })
    )
    assert.equal(res.status, 403, res.text)
  })
})
