import { test } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import * as throttles from '#db/auth/throttles/repo.ts'

const aSubject = () => `phone:+1512555${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`

test('create is an upsert: the second call returns the row the first made', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const subject = aSubject()
      const first = await throttles.create(subject, 'phone', c)
      const second = await throttles.create(subject, 'phone', c)

      assert.equal(second.id, first.id, 'a second send must not mint a second counter')
      assert.equal(second.sends, 0)
      assert.equal(second.attempts, 0)
      assert.equal(second.locked_until, null)
      assert.equal(second.kind, 'phone')
    },
    { actor: TEST_ACTOR.id }
  )
})

test('the locked read returns the row, and getOne finds it by subject', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const subject = aSubject()
      const made = await throttles.create(subject, 'phone', c)
      const locked = await throttles.lock(subject, c)
      const read = await throttles.getOne(subject, c)

      assert.equal(locked?.id, made.id)
      assert.equal(read?.id, made.id)
      assert.equal(await throttles.lock('phone:+19995550000', c), undefined)
    },
    { actor: TEST_ACTOR.id }
  )
})

test('the update writes the send count, the window, the attempts and the lock', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const subject = aSubject()
      await throttles.create(subject, 'phone', c)
      const at = new Date().toISOString()

      const counted = await throttles.update(
        subject,
        { sends: 2, window_started_at: at, last_sent_at: at },
        c
      )
      assert.equal(counted?.sends, 2)
      assert.ok(counted?.window_started_at)

      const locked = await throttles.update(subject, { attempts: 5, locked_until: at }, c)
      assert.equal(locked?.attempts, 5)
      assert.ok(locked?.locked_until)
      assert.equal(locked?.sends, 2, 'a patch touches only the keys it names')

      const cleared = await throttles.update(subject, { attempts: 0, locked_until: null }, c)
      assert.equal(cleared?.attempts, 0)
      assert.equal(cleared?.locked_until, null, 'an explicit null clears')
    },
    { actor: TEST_ACTOR.id }
  )
})

test('an empty patch is not an UPDATE with no SET', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const subject = aSubject()
      const made = await throttles.create(subject, 'phone', c)
      const same = await throttles.update(subject, {}, c)
      assert.equal(same?.id, made.id)
    },
    { actor: TEST_ACTOR.id }
  )
})

test('an audit column cannot be patched through', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const subject = aSubject()
      await throttles.create(subject, 'phone', c)
      await assert.rejects(
        () => throttles.update(subject, { created_at: new Date().toISOString() }, c),
        /audit_stamp trigger/
      )
    },
    { actor: TEST_ACTOR.id }
  )
})

test('remove deletes the counter, and says whether it did', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const subject = aSubject()
      await throttles.create(subject, 'phone', c)
      assert.equal(await throttles.remove(subject, c), true)
      assert.equal(await throttles.getOne(subject, c), undefined)
      assert.equal(await throttles.remove(subject, c), false)
    },
    { actor: TEST_ACTOR.id }
  )
})

test('an ip counter and a phone counter never share a row', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const phone = await throttles.create('phone:+15125550134', 'phone', c)
      const ip = await throttles.create('ip:203.0.113.7', 'ip', c)
      assert.notEqual(phone.id, ip.id)
      assert.equal(ip.kind, 'ip')
    },
    { actor: TEST_ACTOR.id }
  )
})

test('the database stamps the audit columns; no repo call writes them', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const row = await throttles.create(aSubject(), 'phone', c)
      assert.ok(row.created_at, 'created_at was not stamped')
      assert.equal(row.created_by_id, TEST_ACTOR.id, 'the actor came from the transaction')
    },
    { actor: TEST_ACTOR.id }
  )
})
