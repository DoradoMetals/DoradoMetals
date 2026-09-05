import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { inRollback } from '#shared/testing/rollback.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser, anOrder, anAddress } from '#shared/testing/builders/index.ts'
import * as repo from '#db/places/addresses/repo.ts'

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

const NOBODY = '00000000-0000-0000-0000-000000000000'

test('update answers undefined on a missing id', async () => {
  await inRollback(async (c) => {
    assert.equal(await repo.update(NOBODY, { city: 'Nowhere' }, c), undefined)
  })
})

test('update answers the row on a real id, and only touches the columns in the patch', async () => {
  await inRollback(async (c) => {
    const created = await repo.create(
      {
        line_1: '1 Test St',
        city: 'Austin',
        state: 'TX',
        zip: '78701',
      },
      c
    )
    const back = await repo.update(created.id, { city: 'Dallas' }, c)
    assert.equal(back?.city, 'Dallas', 'the update did not answer the row it wrote')

    const row = await repo.getOne(created.id, c)
    assert.equal(row?.city, 'Dallas')
    assert.equal(row?.line_1, '1 Test St', 'a column absent from the patch must not change')
  })
})

test('a patch key present with value null clears that column', async () => {
  await inRollback(async (c) => {
    const created = await repo.create(
      {
        line_1: '1 Test St',
        line_2: 'Apt 4',
        city: 'Austin',
      },
      c
    )
    const back = await repo.update(created.id, { line_2: null }, c)
    assert.equal(back?.line_2, null)

    const row = await repo.getOne(created.id, c)
    assert.equal(row?.line_2, null)
    assert.equal(row?.line_1, '1 Test St', 'an unrelated column must not change')
  })
})

test('getMany answers [] for an empty id list and the matching rows for real ones', async () => {
  await inRollback(async (c) => {
    assert.deepEqual(await repo.getMany([], c), [], 'an empty id list queried anyway')

    const created = await repo.create({ line_1: '1 Test St', city: 'Austin' }, c)
    const rows = await repo.getMany([created.id, NOBODY], c)
    assert.equal(rows.length, 1, 'getMany answered an id with no address row')
    assert.equal(rows[0]?.id, created.id)
  })
})

test("activeAmong answers an address referenced by a live order of that user, not a stranger's", async () => {
  await inRollback(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const address = await anAddress(c, user)
      await anOrder(c, user, { direction: 'purchase' }).withAddress(address)

      assert.deepEqual(
        await repo.activeAmong([address.id, NOBODY], user.id, c),
        [address.id],
        'activeAmong missed an address a live order of this user references'
      )

      const stranger = await aUser(c)
      assert.deepEqual(
        await repo.activeAmong([address.id], stranger.id, c),
        [],
        "activeAmong answered an address that belongs to a different user's order"
      )
    },
    { lock: LOCKS.ORDERS }
  )
})
