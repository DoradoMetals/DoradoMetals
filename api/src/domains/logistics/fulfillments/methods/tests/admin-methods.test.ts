import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import request from 'supertest'
import { mockSessions, restoreSessions, as } from '#shared/testing/session.ts'
import { TEST_ACTOR, TEST_CUSTOMER } from '#shared/testing/actor.ts'
import { FulfillmentMethodRead } from '@dorado/contracts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(() => restoreSessions())

const admin = { ...TEST_ACTOR, role: 'admin' }
const customer = { ...TEST_CUSTOMER, role: 'user' }

const read = async (who: { id: string; role: string }, direction: string) => {
  const res = await as(who as typeof admin, () =>
    request(app).get('/api/fulfillments/methods').query({ direction })
  )
  assert.equal(res.status, 200, res.text)
  return FulfillmentMethodRead.array().parse(res.body)
}

const types = (rows: FulfillmentMethodRead[]) => rows.map((row) => row.type)

test('an admin purchase read offers every enabled method, the admin-only ones included', async () => {
  const methods = await read(admin, 'purchase')
  for (const type of [
    'CARRIER DROPOFF',
    'CARRIER PICKUP',
    'OWN LABEL',
    'PICKUP',
    'APPOINTMENT',
    'WALK IN',
  ]) {
    assert.ok(types(methods).includes(type), `the admin purchase read lacks ${type}`)
  }
  assert.ok(methods.every((m) => m.enabled))
  assert.ok(methods.every((m) => m.direction === 'purchase'))
  const categories = new Set(methods.map((m) => m.category))
  assert.deepEqual([...categories].sort(), ['DIRECT', 'PICKUP', 'SHIPMENT'])
})

test('an admin sale read offers dropship, carrier pickup, carrier drop-off, appointment and walk in', async () => {
  const methods = await read(admin, 'sale')
  for (const type of ['DROPSHIP', 'CARRIER PICKUP', 'CARRIER DROPOFF', 'APPOINTMENT', 'WALK IN']) {
    assert.ok(types(methods).includes(type), `the admin sale read lacks ${type}`)
  }
  assert.equal(types(methods).includes('PICKUP'), false, 'a sale has no Dorado pickup')
})

test('a customer read still hides the admin-only methods', async () => {
  const purchase = await read(customer, 'purchase')
  assert.equal(types(purchase).includes('OWN LABEL'), false)
  assert.equal(types(purchase).includes('WALK IN'), false)
  assert.ok(purchase.every((m) => !m.hidden))
  const sale = await read(customer, 'sale')
  assert.equal(types(sale).includes('CARRIER PICKUP'), false)
})

test('the refiner read offers the drop-off method, admin only', async () => {
  const res = await as(admin, () => request(app).get('/api/fulfillments/methods/refiner'))
  assert.equal(res.status, 200, res.text)
  const methods = FulfillmentMethodRead.array().parse(res.body)
  assert.ok(
    methods.some((m) => m.category === 'DROPOFF'),
    'the refiner read has no drop-off'
  )
  const refused = await as(customer, () => request(app).get('/api/fulfillments/methods/refiner'))
  assert.equal(refused.status, 403, refused.text)
})
