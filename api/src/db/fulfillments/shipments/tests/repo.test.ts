import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { inRollback } from '#shared/testing/rollback.ts'
import { fulfillmentMethodId } from '#shared/testing/builders/index.ts'
import * as shipmentLinks from '#db/fulfillments/shipments/repo.ts'
import * as fulfillments from '#db/fulfillments/repo.ts'
import * as shippingShipments from '#db/shipping/shipments/repo.ts'

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(),
    0,
    'these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`'
  )
})

afterAll(async () => {
  await pool.end()
})

async function aDraftFulfillment(c: PoolClient): Promise<string> {
  const method_id = await fulfillmentMethodId(c, 'CARRIER DROPOFF', 'purchase')
  const draft = await fulfillments.createDraft(method_id, c)
  return draft.id
}

test('create links a parcel, and update on the same shipment moves the link', async () => {
  await inRollback(async (c: PoolClient) => {
    const fulfillment_id = await aDraftFulfillment(c)
    const shipment_id = await shippingShipments.create({ direction: 'Inbound' }, c)

    const row = await shipmentLinks.create({ fulfillment_id, shipment_id }, c)
    assert.equal(row.shipment_id, shipment_id)
    assert.equal(row.fulfillment_id, fulfillment_id)

    const other_fulfillment_id = await aDraftFulfillment(c)
    const changed = await shipmentLinks.update(
      shipment_id,
      { fulfillment_id: other_fulfillment_id },
      c
    )
    assert.equal(changed, true, 'update reported no row changed')

    const [moved] = await shipmentLinks.getByShipment([shipment_id], c)
    assert.equal(
      moved?.id,
      row.id,
      'the unique key is shipment_id - update should move the same row, not insert'
    )
    assert.equal(moved?.fulfillment_id, other_fulfillment_id)
  })
})

test('removeByShipment unlinks the parcel and answers false the second time', async () => {
  await inRollback(async (c: PoolClient) => {
    const fulfillment_id = await aDraftFulfillment(c)
    const shipment_id = await shippingShipments.create({ direction: 'Inbound' }, c)
    await shipmentLinks.create({ fulfillment_id, shipment_id }, c)

    const removed = await shipmentLinks.removeByShipment(shipment_id, c)
    assert.equal(removed, true, 'removeByShipment reported no row changed')

    const removedAgain = await shipmentLinks.removeByShipment(shipment_id, c)
    assert.equal(removedAgain, false, 'removeByShipment reported a change for a link already gone')
  })
})
