// The Fulfillment family's missing pieces: a handover made for an ORDER rather
// than a basket, the Drop-off method end to end, the operator transitions, the
// coverage choices, the carrier a drop-shipped parcel gets late, and the link
// back to the customer order a refiner parcel fills.
import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as, asAdmin } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser, anAddress, anOrder } from '#shared/testing/builders/index.ts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const inLogistics = <T>(fn: (c: PoolClient) => Promise<T>) =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] })

const refinerId = async (c: PoolClient): Promise<string> => {
  const { rows } = await c.query<{ id: string }>('SELECT id FROM refiners.refiners LIMIT 1')
  return rows[0]!.id
}

test('an order with no fulfillment gets one, and asking twice returns the same one', async () => {
  await inLogistics(async (c) => {
    const seller = await aUser(c)
    const order = await anOrder(c, seller, { direction: 'purchase' }).withLots(1)

    await asAdmin(TEST_ACTOR, async () => {
      const made = await request(app).post('/api/fulfillments').send({ order_id: order.id })
      assert.equal(made.status, 200, made.text)
      assert.equal(made.body.fulfillment.order_id, order.id)

      const again = await request(app).post('/api/fulfillments').send({ order_id: order.id })
      assert.equal(again.body.fulfillment.id, made.body.fulfillment.id)

      const both = await request(app)
        .post('/api/fulfillments')
        .send({ order_id: order.id, checkout_id: order.checkout_id })
      assert.equal(both.status, 422, both.text)
    })

    await as({ ...seller, role: 'user' }, async () => {
      const res = await request(app).post('/api/fulfillments').send({ order_id: order.id })
      assert.equal(res.status, 403, 'a customer made a fulfillment for a placed order')
    })
  })
})

test('a refiner order takes a Drop-off, schedules it, and walks its two states', async () => {
  await inLogistics(async (c) => {
    await asAdmin(TEST_ACTOR, async () => {
      const refining = await request(app)
        .post('/api/refining/orders')
        .send({ refiner_id: await refinerId(c), direction: 'sell' })
      assert.equal(refining.status, 201, refining.text)

      const made = await request(app)
        .post('/api/fulfillments')
        .send({ refining_order_id: refining.body.id })
      assert.equal(made.status, 200, made.text)
      assert.equal(made.body.method.category, 'DROPOFF')
      assert.equal(made.body.fulfillment.refining_order_id, refining.body.id)
      assert.deepEqual(made.body.missing, ['refiner_id', 'start_time'])
      assert.deepEqual(made.body.actions.transitions, [], 'an unscheduled drop-off offered a move')

      const employees = await request(app).get('/api/employees')
      const offices = await request(app).get('/api/locations')
      const booked = await request(app)
        .post('/api/fulfillments/schedule_dropoff')
        .send({
          fulfillment_id: made.body.fulfillment.id,
          dropoff: {
            refiner_id: await refinerId(c),
            location_id: offices.body[0].id,
            driver_employee_id: employees.body[0].id,
            start_time: '2026-10-01T15:00:00.000Z',
          },
        })
      assert.equal(booked.status, 200, booked.text)
      assert.equal(booked.body.dropoff.driver_employee_id, employees.body[0].id)
      assert.equal(booked.body.scheduled_at, '2026-10-01T15:00:00.000Z')
      assert.deepEqual(booked.body.missing, [])
      assert.deepEqual(booked.body.actions.transitions, ['IN_TRANSIT', 'DROPPED_OFF'])

      const away = await request(app)
        .post('/api/fulfillments/set_status')
        .send({ fulfillment_id: made.body.fulfillment.id, status: 'IN_TRANSIT' })
      assert.equal(away.status, 200, away.text)
      assert.ok(away.body.dropoff.departed_at, 'headed to the refinery stamped no departure')
      assert.deepEqual(away.body.actions.transitions, ['DROPPED_OFF'])

      const there = await request(app)
        .post('/api/fulfillments/set_status')
        .send({ fulfillment_id: made.body.fulfillment.id, status: 'DROPPED_OFF' })
      assert.equal(there.status, 200, there.text)
      assert.ok(there.body.dropoff.dropped_off_at)
      assert.deepEqual(there.body.actions.transitions, [], 'a finished drop-off offered a move')

      const backwards = await request(app)
        .post('/api/fulfillments/set_status')
        .send({ fulfillment_id: made.body.fulfillment.id, status: 'IN_TRANSIT' })
      assert.equal(backwards.status, 200, 'a done handover has no open moves to contradict')

      const wrongWord = await request(app)
        .post('/api/fulfillments/set_status')
        .send({ fulfillment_id: made.body.fulfillment.id, status: 'HEADED' })
      assert.equal(wrongWord.status, 400, 'the status is an enum now')
    })
  })
})

test('a pickup offers its two moves in order, and only once it is scheduled', async () => {
  await inLogistics(async (c) => {
    const seller = await aUser(c)
    const address = await anAddress(c, seller)
    const order = await anOrder(c, seller, { direction: 'purchase' })
      .withLots(1)
      .withAddress(address)
      .withFulfillment('PICKUP')

    await asAdmin(TEST_ACTOR, async () => {
      const before = await request(app).get(`/api/orders/${order.id}/fulfillments`)
      assert.equal(before.status, 200, before.text)
      assert.deepEqual(before.body.actions.transitions, [])

      const offices = await request(app).get('/api/locations')
      const booked = await request(app)
        .post('/api/fulfillments/schedule_pickup')
        .send({
          fulfillment_id: before.body.fulfillment.id,
          pickup: {
            pickup_address_id: address.id,
            location_id: offices.body[0].id,
            start_time: '2026-10-02T15:00:00.000Z',
          },
        })
      assert.equal(booked.status, 200, booked.text)
      assert.equal(booked.body.pickup.location_id, offices.body[0].id)
      assert.deepEqual(booked.body.actions.transitions, ['IN_TRANSIT', 'PICKED_UP'])

      const away = await request(app)
        .post('/api/fulfillments/set_status')
        .send({ fulfillment_id: before.body.fulfillment.id, status: 'IN_TRANSIT' })
      assert.deepEqual(away.body.actions.transitions, ['PICKED_UP'])

      const skipped = await request(app)
        .post('/api/fulfillments/set_status')
        .send({ fulfillment_id: before.body.fulfillment.id, status: 'IN_PROGRESS' })
      assert.equal(skipped.status, 409, 'an appointment move was offered on a pickup')
    })
  })
})

test('the shipment choices carry cover and who pays the return', async () => {
  await inLogistics(async (c) => {
    const seller = await aUser(c)
    const address = await anAddress(c, seller)
    const order = await anOrder(c, seller, { direction: 'purchase' })
      .withLots(1)
      .withAddress(address)
      .withFulfillment('CARRIER DROPOFF')

    await asAdmin(TEST_ACTOR, async () => {
      const view = await request(app).get(`/api/orders/${order.id}/fulfillments`)
      const res = await request(app)
        .patch(`/api/fulfillments/${view.body.fulfillment.id}`)
        .send({ shipment: { insured: true, additional_coverage: 250, bill_return_to_customer: true } })
      assert.equal(res.status, 200, res.text)

      const { rows } = await c.query(
        `SELECT insured, additional_coverage, bill_return_to_customer
           FROM shipping.shipments WHERE id = $1`,
        [view.body.parcel.id]
      )
      assert.equal(rows[0].insured, true)
      assert.equal(Number(rows[0].additional_coverage), 250)
      assert.equal(rows[0].bill_return_to_customer, true)
    })
  })
})

test('an awaiting-tracking parcel takes a carrier, and one already moving does not', async () => {
  await inLogistics(async (c) => {
    const seller = await aUser(c)
    const address = await anAddress(c, seller)
    const order = await anOrder(c, seller, { direction: 'sale' })
      .withLots(1)
      .withAddress(address)
      .withFulfillment('DROPSHIP')

    const view = await request(app).get(`/api/orders/${order.id}/fulfillments`)
    const shipment_id = await asAdmin(TEST_ACTOR, async () => {
      const read = await request(app).get(`/api/orders/${order.id}/fulfillments`)
      return read.body.parcel.id as string
    })
    assert.ok(view.status === 401 || view.status === 200)

    const { rows: services } = await c.query<{ id: string }>(
      `SELECT id FROM shipping.services WHERE name = 'Express Saver' AND carrier_id IS NOT NULL`
    )

    await asAdmin(TEST_ACTOR, async () => {
      const set = await request(app)
        .patch(`/api/shipments/${shipment_id}`)
        .send({ carrier_service_id: services[0]!.id })
      assert.equal(set.status, 200, set.text)

      const { rows } = await c.query(
        `SELECT carrier_service_id FROM shipping.shipments WHERE id = $1`,
        [shipment_id]
      )
      assert.equal(rows[0].carrier_service_id, services[0]!.id)

      await c.query(`UPDATE shipping.shipments SET tracking_number = 'TRK-LATE' WHERE id = $1`, [
        shipment_id,
      ])
      const late = await request(app)
        .patch(`/api/shipments/${shipment_id}`)
        .send({ carrier_service_id: services[0]!.id })
      assert.equal(late.status, 409, 'a parcel in the network changed carrier')
    })
  })
})

test('a drop-shipped refiner parcel names the customer order it fills', async () => {
  await inLogistics(async (c) => {
    const buyer = await aUser(c)
    const sale = await anOrder(c, buyer, { direction: 'sale' }).withLots(1)

    await asAdmin(TEST_ACTOR, async () => {
      const supplied = await request(app)
        .post(`/api/orders/${sale.id}/supply`)
        .send({ refiner_id: await refinerId(c) })
      assert.equal(supplied.status, 201, supplied.text)

      const made = await request(app)
        .post('/api/fulfillments')
        .send({ refining_order_id: supplied.body.id })
      assert.equal(made.status, 200, made.text)
      assert.equal(made.body.linked_order.id, sale.id)
      assert.equal(made.body.linked_order.reference, `SO-${sale.number}`)
    })
  })
})
