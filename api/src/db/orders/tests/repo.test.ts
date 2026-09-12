import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import pool from '#pool'
import { LOCKS } from '#shared/testing/locks.ts'
import { rollbackIn } from '#shared/testing/rollback.ts'
import { actingAs } from '#shared/testing/actor.ts'
import { aUser, anAdmin, anOrder, aStatus } from '#shared/testing/builders/index.ts'
import * as orders from '#db/orders/repo.ts'
import type { PoolClient } from 'pg'

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

const inRollback = rollbackIn({ lock: LOCKS.ORDERS })

const anOrderFor = async (c: PoolClient): Promise<string> => {
  const user = await aUser(c)
  return (await anOrder(c, user, { direction: 'purchase' })).id
}

const orderRow = async (c: PoolClient, id: string) =>
  (
    await c.query(
      `SELECT cancelled_at, notes, updated_by, updated_by_id, updated_at, created_at,
            order_sent, tracking_updated, review_created
       FROM orders.orders WHERE id = $1`,
      [id]
    )
  ).rows[0] as Record<string, unknown>

test('a cancelled_at write records the fact and its author', async () => {
  await inRollback(async (c: PoolClient) => {
    const id = await anOrderFor(c)
    const admin = await anAdmin(c)
    const cancelled_at = new Date().toISOString()

    await actingAs(c, admin.id)
    const returned = await orders.update(id, { cancelled_at }, {}, c)
    assert.equal(returned, true, 'the write did not report the row it changed')

    const row = await orderRow(c, id)
    assert.ok(row.cancelled_at, 'cancelled_at was not written')
    assert.equal(row.updated_by_id, admin.id, 'the trigger did not stamp the actor')
    assert.equal(row.updated_by, admin.name, 'the legacy name column went unfilled')
  })
})

test('a patch with no actor keeps the previous author and still moves updated_at', async () => {
  await inRollback(async (c: PoolClient) => {
    const id = await anOrderFor(c)
    const admin = await anAdmin(c)

    await actingAs(c, admin.id)
    await orders.update(id, { notes: aStatus() }, {}, c)
    const before = await orderRow(c, id)

    await actingAs(c, null)
    const second = aStatus()
    await orders.update(id, { notes: second }, {}, c)
    const after = await orderRow(c, id)

    assert.equal(after.notes, second)
    assert.equal(after.updated_by_id, admin.id, 'an unattributed write erased the author')
    assert.equal(after.updated_by, admin.name)
    assert.ok(
      (after.updated_at as Date) > (before.updated_at as Date),
      'updated_at did not move on the second write'
    )
  })
})

test('each of the three flags sets its own column and no other', async () => {
  await inRollback(async (c: PoolClient) => {
    const id = await anOrderFor(c)

    const FLAGS = ['order_sent', 'tracking_updated', 'review_created'] as const
    for (const flag of FLAGS) {
      await c.query(
        `UPDATE orders.orders
            SET order_sent = false, tracking_updated = false, review_created = false
          WHERE id = $1`,
        [id]
      )

      const returned = await orders.update(id, { [flag]: true }, {}, c)
      assert.equal(returned, true, `${flag} did not report the row it changed`)

      const row = await orderRow(c, id)
      assert.equal(row[flag], true, `${flag} was not set`)
      for (const other of FLAGS) {
        if (other === flag) continue
        assert.equal(row[other], false, `setting ${flag} also set ${other}`)
      }
    }
  })
})

test('update answers false for an id that names nothing and true for a real one', async () => {
  await inRollback(async (c: PoolClient) => {
    const missing = await orders.update(randomUUID(), { notes: aStatus() }, {}, c)
    assert.equal(missing, false, 'an update against no row reported success')

    const id = await anOrderFor(c)
    assert.equal(await orders.update(id, { notes: aStatus() }, {}, c), true)
  })
})

test('a guard that does not match writes nothing and says so', async () => {
  await inRollback(async (c: PoolClient) => {
    const id = await anOrderFor(c)
    const note = aStatus()

    const wrong = await orders.update(id, { notes: note }, { direction: 'sale' }, c)
    assert.equal(wrong, false, 'the guard let a mismatched row through')
    assert.notEqual((await orderRow(c, id)).notes, note, 'the guarded write landed anyway')

    const right = await orders.update(id, { notes: note }, { direction: 'purchase' }, c)
    assert.equal(right, true)
    assert.equal((await orderRow(c, id)).notes, note)
  })
})

test('an empty patch changes nothing and is not a failure', async () => {
  await inRollback(async (c: PoolClient) => {
    const id = await anOrderFor(c)
    assert.equal(await orders.update(id, {}, {}, c), true)
  })
})
