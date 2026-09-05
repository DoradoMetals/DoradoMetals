import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import { randomUUID } from 'node:crypto'
import pool from '#pool'
import { inRollback } from '#shared/testing/rollback.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser, anOrder, aShipment } from '#shared/testing/builders/index.ts'
import * as shipments from '#db/shipping/shipments/repo.ts'

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

test('update replaces the row - everything the carrier told us, in one write', async () => {
  await inRollback(async (c: PoolClient) => {
    const id = await shipments.create({ direction: 'Inbound' }, c)

    const changed = await shipments.update(
      id,
      {
        tracking_number: '1Z999',
        shipping_status: 'Label Created',
        direction: 'Inbound',
        insured: true,
        declared_value: 500,
        cost: 12.5,
      },
      c
    )
    assert.equal(changed, true, 'update reported no row changed')

    const row = await shipments.getOne(id, c)
    assert.equal(row?.tracking_number, '1Z999')
    assert.equal(row?.shipping_status, 'Label Created')
    assert.equal(row?.insured, true)
    assert.equal(Number(row?.declared_value), 500)
  })
})

test('update answers false for an id with no shipment row', async () => {
  await inRollback(async (c: PoolClient) => {
    const changed = await shipments.update(randomUUID(), { direction: 'Inbound' }, c)
    assert.equal(changed, false, 'update reported a change for a shipment that does not exist')
  })
})

test('remove deletes a real shipment and answers false the second time', async () => {
  await inRollback(async (c: PoolClient) => {
    const id = await shipments.create({ direction: 'Inbound' }, c)

    const removed = await shipments.remove(id, c)
    assert.equal(removed, true, 'remove reported no row changed')
    assert.equal(await shipments.getOne(id, c), undefined)

    const removedAgain = await shipments.remove(id, c)
    assert.equal(removedAgain, false, 'remove reported a change for a shipment already gone')
  })
})

test('getAll answers every shipment row, this one included', async () => {
  await inRollback(async (c: PoolClient) => {
    const id = await shipments.create({ direction: 'Inbound', tracking_number: 'GETALL1' }, c)

    const rows = await shipments.getAll(c)
    const found = rows.find((r) => r.id === id)
    assert.ok(found, 'getAll did not answer the row just created')
    assert.equal(found.tracking_number, 'GETALL1')
    assert.equal(found.direction, 'Inbound')
  })
})

test('getMany answers [] for an empty id list and the matching rows for a real one', async () => {
  await inRollback(async (c: PoolClient) => {
    assert.deepEqual(await shipments.getMany([], c), [], 'an empty id list queried anyway')

    const id = await shipments.create({ direction: 'Outbound', tracking_number: 'GETMANY1' }, c)
    const rows = await shipments.getMany([id, randomUUID()], c)
    assert.equal(rows.length, 1, 'getMany answered other ids besides the one that exists')
    assert.equal(rows[0]?.id, id)
    assert.equal(rows[0]?.tracking_number, 'GETMANY1')
  })
})

test('getRead answers the read shape for a real id and undefined otherwise', async () => {
  await inRollback(async (c: PoolClient) => {
    const id = await shipments.create(
      {
        direction: 'Inbound',
        tracking_number: 'GETREAD1',
        shipping_status: 'Label Created',
      },
      c
    )

    const row = await shipments.getRead(id, c)
    assert.equal(row?.id, id)
    assert.equal(row?.tracking_number, 'GETREAD1')
    assert.equal(row?.shipping_status, 'Label Created')
    assert.ok(!('label' in (row ?? {})), 'the read shape carried the raw label bytes')

    assert.equal(await shipments.getRead(randomUUID(), c), undefined)
  })
})

test("getReadForOrder and getForOrder both resolve an order's shipments, oldest first", async () => {
  await inRollback(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const order = await anOrder(c, user, { direction: 'purchase' })
      const built = await aShipment(c, order)

      const read = await shipments.getReadForOrder(order.id, c)
      assert.equal(read.length, 1)
      assert.equal(read[0]?.id, built.id)
      assert.equal(read[0]?.tracking_number, built.tracking_number)
      assert.ok(!('label' in (read[0] ?? {})), 'getReadForOrder carried the raw label bytes')

      const forOrder = await shipments.getForOrder(order.id, c)
      assert.equal(forOrder.length, 1)
      assert.equal(forOrder[0]?.id, built.id)
      assert.equal(
        forOrder[0]?.label,
        null,
        'a shipment created with no label encoded to something'
      )

      assert.deepEqual(await shipments.getReadForOrder(randomUUID(), c), [])
      assert.deepEqual(await shipments.getForOrder(randomUUID(), c), [])
    },
    { lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] }
  )
})
