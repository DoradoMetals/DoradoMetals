import { test } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import * as verifications from '#db/auth/verification/repo.ts'

const mint = (c: PoolClient, identifier: string, value: string, minutes = 10) =>
  c.query(
    `INSERT INTO auth.verification (identifier, value, "expiresAt")
     VALUES ($1, $2, (now() at time zone 'UTC') + ($3 || ' minutes')::interval)`,
    [identifier, value, String(minutes)]
  )

test('a code is read back by the value it was sent to', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      await mint(c, 'sign-in-otp-reader@dorado.test', '418209:0')
      const row = await verifications.byIdentifier('sign-in-otp-reader@dorado.test', c)
      assert.equal(row?.value, '418209:0')
      assert.equal(await verifications.byIdentifier('sign-in-otp-nobody@dorado.test', c), undefined)
    },
    { actor: TEST_ACTOR.id }
  )
})

test('a resend leaves the newest code as the one that is read', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      await mint(c, '+15125559001', '111111:0')
      await mint(c, '+15125559001', '222222:0')
      // Every row here is written by one writer, so one clock orders them: the
      // older code is aged against the same default `now()` the newer one took.
      await c.query(`UPDATE auth.verification SET "createdAt" = "createdAt" - interval '1 minute'
                      WHERE identifier = '+15125559001' AND value = '111111:0'`)
      const row = await verifications.byIdentifier('+15125559001', c)
      assert.equal(row?.value, '222222:0', 'an old code must not outrank the one just sent')
    },
    { actor: TEST_ACTOR.id }
  )
})

test('remove clears every code for that identifier, and says whether it did', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      await mint(c, '+15125559002', '111111:0')
      await mint(c, '+15125559002', '222222:0')
      assert.equal(await verifications.remove('+15125559002', c), true)
      assert.equal(await verifications.byIdentifier('+15125559002', c), undefined)
      assert.equal(await verifications.remove('+15125559002', c), false)
    },
    { actor: TEST_ACTOR.id }
  )
})

test('an expired code is still readable - the rule decides, not the repo', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      await mint(c, '+15125559003', '333333:0', -5)
      const row = await verifications.byIdentifier('+15125559003', c)
      assert.ok(row, 'the read is a read; expiry is rules.codeMatches')
      assert.ok(new Date(row.expiresAt).getTime() < Date.now())
    },
    { actor: TEST_ACTOR.id }
  )
})
