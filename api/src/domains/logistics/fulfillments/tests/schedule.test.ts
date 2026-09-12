import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import {
  aUser,
  anOrder,
  aShipment,
  anAddress,
  fulfillmentMethodId,
} from '#shared/testing/builders/index.ts'

await mockSessions()
const { default: app } = await import('#app')

type UserFixture = { id: string; name: string | null; email: string | null }
type IdRow = { id: string }

const admin: UserFixture = TEST_ACTOR

const aShipmentFulfilment = async (c: PoolClient) => {
  const order = await anOrder(c, await aUser(c), { direction: 'purchase' })
  const shipment = await aShipment(c, order, { method: 'CARRIER DROPOFF' })
  return { id: shipment.fulfillment_id, order_id: order.id, user_id: order.user_id! }
}

const aDirectFulfilment = async (c: PoolClient) => {
  const user = await aUser(c)
  const order = await anOrder(c, user, { direction: 'purchase' })
  const method_id = await fulfillmentMethodId(c, 'APPOINTMENT', 'purchase')
  const { rows } = await c.query<IdRow>(
    `INSERT INTO fulfillments.fulfillments (id, order_id, method_id, status)
     VALUES (gen_random_uuid(), $1, $2, 'PENDING') RETURNING id`,
    [order.id, method_id]
  )
  return { id: rows[0]!.id, order_id: order.id, user_id: user.id }
}

const aPickupMethodId = (c: PoolClient) => fulfillmentMethodId(c, 'PICKUP', 'purchase')

const aLocationId = async (c: PoolClient) => {
  const { rows } = await c.query<IdRow>(`SELECT id FROM places.locations WHERE name = $1`, [
    'Dorado Return Address',
  ])
  assert.ok(rows[0], 'the places.locations seed is missing - run provision:test')
  return rows[0]!.id
}

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

test("set_status writes the fulfillment's status", async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      const shipmentFulfilment = await aShipmentFulfilment(client)
      await as({ ...admin, role: 'admin' }, async () => {
        const res = await request(app)
          .post('/api/fulfillments/set_status')
          .send({ fulfillment_id: shipmentFulfilment.id, status: 'COMPLETED' })

        assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`)

        const { rows } = await client.query(
          `SELECT status FROM fulfillments.fulfillments WHERE id = $1`,
          [shipmentFulfilment.id]
        )
        assert.equal(rows[0].status, 'COMPLETED', 'the status did not change')
      })
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] }
  )
})

test('set_method moves the fulfillment onto another method', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      const directFulfilment = await aDirectFulfilment(client)
      const pickupMethodId = await aPickupMethodId(client)
      await as({ ...admin, role: 'admin' }, async () => {
        const res = await request(app)
          .post('/api/fulfillments/set_method')
          .send({ fulfillment_id: directFulfilment.id, method_id: pickupMethodId })

        assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`)

        const { rows } = await client.query(
          `SELECT method_id FROM fulfillments.fulfillments WHERE id = $1`,
          [directFulfilment.id]
        )
        assert.equal(rows[0].method_id, pickupMethodId, 'the method did not change')
      })
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] }
  )
})

test('schedule_direct books the appointment', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      const directFulfilment = await aDirectFulfilment(client)
      const locationId = await aLocationId(client)
      await as({ ...admin, role: 'admin' }, async () => {
        const res = await request(app)
          .post('/api/fulfillments/schedule_direct')
          .send({
            fulfillment_id: directFulfilment.id,
            direct: {
              location_id: locationId,
              is_appointment: true,
              start_time: '2026-09-01T15:00:00.000Z',
              end_time: '2026-09-01T15:30:00.000Z',
            },
          })

        assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`)

        const { rows } = await client.query(
          `SELECT location_id, is_appointment FROM fulfillments.directs WHERE fulfillment_id = $1`,
          [directFulfilment.id]
        )
        assert.ok(rows.length, 'no direct booking was written')
        assert.equal(rows[0].location_id, locationId, 'the booking is at the wrong location')
        assert.equal(rows[0].is_appointment, true, 'the booking is not an appointment')
      })
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] }
  )
})

test('cancel_schedule removes the booking', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      const directFulfilment = await aDirectFulfilment(client)
      const locationId = await aLocationId(client)
      await as({ ...admin, role: 'admin' }, async () => {
        await request(app)
          .post('/api/fulfillments/schedule_direct')
          .send({
            fulfillment_id: directFulfilment.id,
            direct: { location_id: locationId, is_appointment: true },
          })

        const booked = await client.query(
          `SELECT 1 FROM fulfillments.directs WHERE fulfillment_id = $1`,
          [directFulfilment.id]
        )
        assert.equal(booked.rows.length, 1, 'the fixture booking was not created')

        const res = await request(app)
          .post('/api/fulfillments/cancel_schedule')
          .send({ fulfillment_id: directFulfilment.id })

        assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`)

        const { rows } = await client.query(
          `SELECT 1 FROM fulfillments.directs WHERE fulfillment_id = $1`,
          [directFulfilment.id]
        )
        assert.equal(rows.length, 0, 'the booking survived the cancel')
      })
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] }
  )
})

test('schedule_pickup books once the fulfillment is moved onto a PICKUP method', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      const directFulfilment = await aDirectFulfilment(client)
      const pickupMethodId = await aPickupMethodId(client)
      await as({ ...admin, role: 'admin' }, async () => {
        const address = (await client.query(`SELECT id FROM places.addresses ORDER BY id LIMIT 1`))
          .rows[0]
        assert.ok(address, 'dev needs an address in places')

        await request(app)
          .post('/api/fulfillments/set_method')
          .send({ fulfillment_id: directFulfilment.id, method_id: pickupMethodId })

        const res = await request(app)
          .post('/api/fulfillments/schedule_pickup')
          .send({
            fulfillment_id: directFulfilment.id,
            pickup: {
              pickup_address_id: address.id,
              start_time: '2026-09-02T14:00:00.000Z',
              end_time: '2026-09-02T16:00:00.000Z',
            },
          })

        assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`)

        const { rows } = await client.query(
          `SELECT pickup_address_id FROM fulfillments.pickups WHERE fulfillment_id = $1`,
          [directFulfilment.id]
        )
        assert.ok(rows.length, 'no pickup booking was written')
        assert.equal(rows[0].pickup_address_id, address.id, 'booked at the wrong address')
      })
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] }
  )
})

test('set_method refuses to move a fulfillment that already has a shipment, and says why', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      const shipmentFulfilment = await aShipmentFulfilment(client)
      const pickupMethodId = await aPickupMethodId(client)
      await as({ ...admin, role: 'admin' }, async () => {
        const res = await request(app)
          .post('/api/fulfillments/set_method')
          .send({ fulfillment_id: shipmentFulfilment.id, method_id: pickupMethodId })

        assert.equal(res.status, 409, `expected a 409 conflict, got ${res.status}`)
        assert.match(
          String(res.body?.error?.message ?? ''),
          /already has a shipment/,
          'the refusal reached the caller without its reason'
        )
      })
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] }
  )
})

test('an admin status change stamps the admin who made it', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const { id } = await aShipmentFulfilment(c)
      await c.query(
        `UPDATE fulfillments.fulfillments SET updated_by_id = NULL, updated_by = NULL WHERE id = $1`,
        [id]
      )

      const res = await as({ ...admin, role: 'admin' }, () =>
        request(app)
          .post('/api/fulfillments/set_status')
          .send({ fulfillment_id: id, status: 'COMPLETED' })
      )
      assert.equal(res.status, 200, res.text)

      const { rows } = await c.query(
        `SELECT status, updated_by_id FROM fulfillments.fulfillments WHERE id = $1`,
        [id]
      )
      assert.equal(rows[0].status, 'COMPLETED')
      assert.equal(rows[0].updated_by_id, admin.id, 'the audit trail missed an admin edit')
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] }
  )
})

test('an admin method change stamps the admin, and its four writes land together', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const { id } = await aDirectFulfilment(c)
      await c.query(
        `INSERT INTO fulfillments.directs (fulfillment_id, location_id) VALUES ($1, $2)`,
        [id, await aLocationId(c)]
      )
      const method_id = await aPickupMethodId(c)
      await c.query(`UPDATE fulfillments.fulfillments SET updated_by_id = NULL WHERE id = $1`, [id])

      const res = await as({ ...admin, role: 'admin' }, () =>
        request(app).post('/api/fulfillments/set_method').send({ fulfillment_id: id, method_id })
      )
      assert.equal(res.status, 200, res.text)

      const { rows } = await c.query(
        `SELECT f.method_id, f.updated_by_id,
                (SELECT count(*)::int FROM fulfillments.pickups p WHERE p.fulfillment_id = f.id) AS pickups,
                (SELECT count(*)::int FROM fulfillments.directs d WHERE d.fulfillment_id = f.id) AS directs
           FROM fulfillments.fulfillments f WHERE f.id = $1`,
        [id]
      )
      assert.equal(rows[0].method_id, method_id)
      assert.equal(rows[0].updated_by_id, admin.id, 'the audit trail missed an admin method change')
      assert.equal(rows[0].pickups, 1, 'the new detail row is missing')
      assert.equal(rows[0].directs, 0, 'the detail row of the category being left survived')
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] }
  )
})
