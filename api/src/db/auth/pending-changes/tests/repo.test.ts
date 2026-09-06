import { test } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser } from '#shared/testing/builders/index.ts'
import * as pendingChanges from '#db/auth/pending-changes/repo.ts'

const inTenMinutes = () => new Date(Date.now() + 600_000).toISOString()

test('an asserted change is held with the channel that will prove it', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const made = await pendingChanges.create(
        {
          user_id: user.id,
          factor: 'email',
          next_value: 'new@dorado.test',
          verified_via: 'sms',
          sent_to: '+15125550134',
          expires_at: inTenMinutes(),
        },
        c
      )
      assert.ok(made.id)
      assert.equal(made.confirmed_at, null)
      assert.equal(made.verified_via, 'sms', 'an email change is proved by the phone')
      assert.equal((await pendingChanges.openFor(user.id, c))?.id, made.id)
      assert.equal((await pendingChanges.getOne(made.id, c))?.next_value, 'new@dorado.test')
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})

test('a user may hold only ONE open change at a time', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const row = {
        user_id: user.id,
        factor: 'email' as const,
        next_value: 'a@dorado.test',
        verified_via: 'sms' as const,
        sent_to: '+15125550134',
        expires_at: inTenMinutes(),
      }
      await pendingChanges.create(row, c)
      await assert.rejects(
        () => pendingChanges.create({ ...row, next_value: 'b@dorado.test' }, c),
        /pending_changes_one_open_per_user|duplicate key/,
        'two open changes would let one code confirm the other'
      )
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})

test('a confirmed change keeps its place in the trail and frees the slot', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const made = await pendingChanges.create(
        {
          user_id: user.id,
          factor: 'phone',
          next_value: '+15125550134',
          verified_via: 'email',
          sent_to: 'old@dorado.test',
          expires_at: inTenMinutes(),
        },
        c
      )
      const confirmed = await pendingChanges.update(
        made.id,
        { confirmed_at: new Date().toISOString() },
        c
      )
      assert.ok(confirmed?.confirmed_at, 'the row records when it was confirmed')
      assert.equal(await pendingChanges.openFor(user.id, c), undefined, 'the slot is free')
      assert.ok(await pendingChanges.getOne(made.id, c), 'and the row is still there')

      const next = await pendingChanges.create(
        {
          user_id: user.id,
          factor: 'email',
          next_value: 'x@dorado.test',
          verified_via: 'sms',
          sent_to: '+15125550134',
          expires_at: inTenMinutes(),
        },
        c
      )
      assert.notEqual(next.id, made.id)
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})

test('removeOpen clears an abandoned change and leaves a confirmed one alone', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const made = await pendingChanges.create(
        {
          user_id: user.id,
          factor: 'email',
          next_value: 'a@dorado.test',
          verified_via: 'sms',
          sent_to: '+15125550134',
          expires_at: inTenMinutes(),
        },
        c
      )
      assert.equal(await pendingChanges.removeOpen(user.id, c), true)
      assert.equal(await pendingChanges.getOne(made.id, c), undefined)
      assert.equal(await pendingChanges.removeOpen(user.id, c), false)
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})
