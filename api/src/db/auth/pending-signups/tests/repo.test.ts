import { test } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import * as pendingSignups from '#db/auth/pending-signups/repo.ts'

const aNumber = () => `+1512666${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`
const inTenMinutes = () => new Date(Date.now() + 600_000).toISOString()

test('a signup is held by phone number until the code is answered', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const phone_number = aNumber()
      const made = await pendingSignups.create(
        { phone_number, email: 'new@dorado.test', name: 'New Person', expires_at: inTenMinutes() },
        c
      )
      assert.ok(made.id, 'the database mints the id')
      assert.equal((await pendingSignups.byPhone(phone_number, c))?.id, made.id)
      assert.equal((await pendingSignups.getOne(made.id, c))?.email, 'new@dorado.test')
    },
    { actor: TEST_ACTOR.id }
  )
})

test('a second attempt on the same number reuses the row rather than racing it', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const phone_number = aNumber()
      const first = await pendingSignups.create(
        { phone_number, email: 'a@dorado.test', name: 'A', expires_at: inTenMinutes() },
        c
      )
      const second = await pendingSignups.create(
        { phone_number, email: 'b@dorado.test', name: 'B', expires_at: inTenMinutes() },
        c
      )
      assert.equal(second.id, first.id, 'a unique violation would have been the alternative')
      assert.equal(second.email, 'b@dorado.test', 'the newer answers win')
      assert.equal(second.name, 'B')
    },
    { actor: TEST_ACTOR.id }
  )
})

test('the row is deleted by the number the verify carried', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const phone_number = aNumber()
      await pendingSignups.create(
        { phone_number, email: 'a@dorado.test', name: 'A', expires_at: inTenMinutes() },
        c
      )
      assert.equal(await pendingSignups.remove(phone_number, c), true)
      assert.equal(await pendingSignups.byPhone(phone_number, c), undefined)
      assert.equal(await pendingSignups.remove(phone_number, c), false)
    },
    { actor: TEST_ACTOR.id }
  )
})

test('a phone-less signup is held by email until the code is answered', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const email = `new-${Math.floor(Math.random() * 100000)}@dorado.test`
      const made = await pendingSignups.create(
        { phone_number: null, email, name: 'New Person', expires_at: inTenMinutes() },
        c
      )
      assert.ok(made.id, 'the database mints the id')
      assert.equal(made.phone_number, null)
      assert.equal((await pendingSignups.byEmail(email, c))?.id, made.id)
    },
    { actor: TEST_ACTOR.id }
  )
})

test('a second phone-less attempt at the same email reuses the row rather than racing it', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const email = `new-${Math.floor(Math.random() * 100000)}@dorado.test`
      const first = await pendingSignups.create(
        { phone_number: null, email, name: 'A', expires_at: inTenMinutes() },
        c
      )
      const second = await pendingSignups.create(
        { phone_number: null, email, name: 'B', expires_at: inTenMinutes() },
        c
      )
      assert.equal(second.id, first.id, 'a unique violation would have been the alternative')
      assert.equal(second.name, 'B', 'the newer answers win')
    },
    { actor: TEST_ACTOR.id }
  )
})

test('the row is deleted by the email the verify carried', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const email = `new-${Math.floor(Math.random() * 100000)}@dorado.test`
      await pendingSignups.create(
        { phone_number: null, email, name: 'A', expires_at: inTenMinutes() },
        c
      )
      assert.equal(await pendingSignups.removeByEmail(email, c), true)
      assert.equal(await pendingSignups.byEmail(email, c), undefined)
      assert.equal(await pendingSignups.removeByEmail(email, c), false)
    },
    { actor: TEST_ACTOR.id }
  )
})

test('the update patches only what it names', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const made = await pendingSignups.create(
        { phone_number: aNumber(), email: 'a@dorado.test', name: 'A', expires_at: inTenMinutes() },
        c
      )
      const patched = await pendingSignups.update(made.id, { name: 'A Renamed' }, c)
      assert.equal(patched?.name, 'A Renamed')
      assert.equal(patched?.email, 'a@dorado.test')
    },
    { actor: TEST_ACTOR.id }
  )
})
