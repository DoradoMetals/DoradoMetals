import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as, asAdmin } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { aUser, aProduct, anOrder, aShipment } from '#shared/testing/builders/index.ts'
import { LOCKS } from '#shared/testing/locks.ts'

const ORDER_LOCK = LOCKS.ORDERS

await mockSessions()
const { default: app } = await import('#app')

type AdminFixture = { id: string; name: string | null; email: string | null }
type ShipmentFixture = {
  id: string
  order_id: string | null
  carrier_id: string | null
  tracking_number: string | null
}

const admin: AdminFixture = TEST_ACTOR

const aSalesShipment = async (c: PoolClient) => {
  const customer = await aUser(c)
  const product = await aProduct(c)
  const order = await anOrder(c, customer, { direction: 'sale', status: 'Pending' })
    .withBullion(product, 1)
    .withTotals({ total: 500 })
  const parcel = await aShipment(c, order, { method: 'DROPSHIP' })
  const { rows } = await c.query<{ carrier_id: string }>(
    `SELECT carrier_id FROM shipping.services WHERE id = $1`,
    [parcel.carrier_service_id]
  )
  return {
    shipment: {
      id: parcel.id,
      order_id: order.id,
      carrier_id: rows[0]!.carrier_id,
      tracking_number: parcel.tracking_number,
    },
  }
}

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

test('an admin can record a tracking number against a sales order', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      const { shipment } = await aSalesShipment(client)
      await asAdmin(admin, async () => {
        const res = await request(app).patch(`/api/shipments/${shipment.id}`).send({ tracking_number: 'E2E-TRACK-000001' })

        assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`)
        assert.ok(
          !JSON.stringify(res.body ?? '').includes('is not a function'),
          'the handler called something that does not exist'
        )
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test('the tracking number actually lands on the shipment', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      const { shipment } = await aSalesShipment(client)
      await asAdmin(admin, async () => {
        await request(app).patch(`/api/shipments/${shipment.id}`).send({ tracking_number: 'E2E-TRACK-000002' })

        const { rows } = await client.query(
          `SELECT tracking_number FROM shipping.shipments WHERE id = $1`,
          [shipment.id]
        )
        assert.equal(
          rows[0]?.tracking_number,
          'E2E-TRACK-000002',
          'the route answered but the shipment was not updated'
        )
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test('the patch refuses a carrier_id - it decided nothing and is gone', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      const { shipment } = await aSalesShipment(client)
      await asAdmin(admin, async () => {
        const res = await request(app)
          .patch(`/api/shipments/${shipment.id}`)
          .send({ tracking_number: 'E2E-TRACK-000003', carrier_id: shipment.carrier_id })
        assert.equal(res.status, 400, `answered ${res.status}: ${JSON.stringify(res.body)}`)
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})
