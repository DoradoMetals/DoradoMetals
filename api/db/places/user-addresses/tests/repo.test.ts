import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { LOCKS } from '#shared/testing/locks.ts'
import { rollbackIn } from '#shared/testing/rollback.ts'
import { aUser, anAddress } from '#shared/testing/builders/index.ts'
import * as userAddresses from '#db/places/user-addresses/repo.ts'

const inRollback = rollbackIn({ lock: LOCKS.ADDRESSES })

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

test('update writes a real (address, user) link and returns the changed row', async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c)
    const built = await anAddress(c, user, { recipient_name: 'Ada', label: 'Home' })

    const after = await userAddresses.update(
      built.id,
      user.id,
      { recipient_name: 'Grace', label: 'Work' },
      c
    )
    assert.ok(after, "update reported no row - the fixture's own link was not found")
    assert.equal(after.recipient_name, 'Grace')
    assert.equal(after.label, 'Work')
  })
})

test('a patch that names neither flag leaves the default alone', async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c)
    const built = await anAddress(c, user, { default_shipping: true })

    const after = await userAddresses.update(built.id, user.id, { recipient_name: 'Ada' }, c)
    assert.ok(after)
    assert.equal(after.default_shipping, true, 'editing the recipient cost the address its default')
    assert.equal(after.default_billing, true)
  })
})

test("update answers undefined for an address that is not in that person's book", async () => {
  await inRollback(async (c: PoolClient) => {
    const owner = await aUser(c)
    const stranger = await aUser(c)
    const built = await anAddress(c, owner)

    const asStranger = await userAddresses.update(built.id, stranger.id, { label: 'Not Mine' }, c)
    assert.equal(asStranger, undefined, "a stranger's update reached another person's address")

    const missing = await userAddresses.update(randomUUID(), owner.id, { label: 'Nowhere' }, c)
    assert.equal(
      missing,
      undefined,
      'update reported a row for an address link that does not exist'
    )
  })
})

test('remove deletes a real link and answers false the second time', async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c)
    const built = await anAddress(c, user)

    const removed = await userAddresses.remove(built.id, user.id, c)
    assert.equal(removed, true, 'remove reported no row changed')
    assert.equal(await userAddresses.getOne(built.id, user.id, c), undefined)

    const removedAgain = await userAddresses.remove(built.id, user.id, c)
    assert.equal(removedAgain, false, 'remove reported a change for a link already gone')
  })
})

test("remove answers false for an address in someone else's book", async () => {
  await inRollback(async (c: PoolClient) => {
    const owner = await aUser(c)
    const stranger = await aUser(c)
    const built = await anAddress(c, owner)

    const removed = await userAddresses.remove(built.id, stranger.id, c)
    assert.equal(removed, false, "a stranger was able to remove somebody else's address link")
    assert.ok(
      await userAddresses.getOne(built.id, owner.id, c),
      'the link was removed despite the ownership mismatch'
    )
  })
})
