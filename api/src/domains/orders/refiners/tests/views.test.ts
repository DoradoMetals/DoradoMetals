import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { RefinerOrderView, RefinerView } from '@dorado/contracts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { aUser, anOrder, refinerNamed } from '#shared/testing/builders/index.ts'
import * as refinerService from '#orders/refiners/service.ts'
import * as refinerOrders from '#orders/refiners/orders/service.ts'
import * as engagements from '#db/refiners/orders/repo.ts'

afterAll(async () => {
  await pool.end()
})

test('the refiner list is one read the contract parses, nested and sorted by name', async () => {
  const rows = await refinerService.getAllRefiners()
  assert.ok(rows.length >= 2, 'the seed no longer holds two refiners')
  for (const row of rows) RefinerView.parse(row)

  const names = rows.map((r) => r.organization.name ?? '')
  assert.deepEqual(names, [...names].sort(), 'the view stopped ordering by organization name')
})

test('a refiner is read by id, and an id nothing seeded answers null', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const id = await refinerNamed(c, 'Elemetal')
      const view = await refinerService.getRefinerFromId(id)
      assert.ok(view, 'the seeded refiner read back as null')
      assert.equal(view.organization.name, 'Elemetal')
      assert.equal(await refinerService.getRefinerFromId(TEST_ACTOR.id), null)
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})

test('the engagement view carries the refiner, its items and its spots in one read', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = await aUser(c)
      const order = await anOrder(c, customer, { direction: 'purchase' }).withLots(2).withSpots()

      assert.equal(await refinerOrders.getByOrder(order.id, c), null)

      await refinerService.mirrorForOrder(order.id, c)
      const refiner_id = await refinerNamed(c, 'Elemetal')
      const engagement = await engagements.findByOrder(order.id, c)
      assert.ok(engagement, 'the mirror wrote no engagement')
      await engagements.update(engagement.id, { refiner_id }, c)

      const view = await refinerOrders.getByOrder(order.id, c)
      assert.ok(view, 'the engagement view came back null after the mirror')
      RefinerOrderView.parse(view)

      assert.equal(view.order_id, order.id)
      assert.equal(view.refiner?.id, refiner_id)
      assert.equal(view.refiner?.organization.name, 'Elemetal')
      assert.equal(view.items.length, 2, 'the view lost a mirrored line')
      assert.ok(view.spots.length > 0, 'the view lost the mirrored spots')
      assert.match(view.created_at, /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/)
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.USERS] }
  )
})

test('the mirror is idempotent - a second call adds no line and no spot', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = await aUser(c)
      const order = await anOrder(c, customer, { direction: 'purchase' }).withLots(2).withSpots()

      await refinerService.mirrorForOrder(order.id, c)
      const first = await refinerOrders.getByOrder(order.id, c)
      await refinerService.mirrorForOrder(order.id, c)
      const second = await refinerOrders.getByOrder(order.id, c)

      assert.equal(second?.items.length, first?.items.length, 'a second mirror duplicated lines')
      assert.equal(second?.spots.length, first?.spots.length, 'a second mirror duplicated spots')
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.USERS] }
  )
})
