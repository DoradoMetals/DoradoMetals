import { test } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser } from '#shared/testing/builders/index.ts'
import * as users from '#db/auth/users/repo.ts'

const aNumber = () => `+1512777${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`

test('an account is found by id, by phone and by email', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const phone_number = aNumber()
      const built = await aUser(c, { phone_number })

      assert.equal((await users.getOne(built.id, c))?.email, built.email)
      assert.equal((await users.byPhone(phone_number, c))?.id, built.id)
      assert.equal((await users.byEmail(built.email, c))?.id, built.id)
      assert.equal(
        (await users.byEmail(built.email.toUpperCase(), c))?.id,
        built.id,
        'an address is one address whatever case it is typed in'
      )
      assert.equal(await users.byPhone(aNumber(), c), undefined)
      assert.equal(await users.byEmail('nobody@dorado.test', c), undefined)
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})

test('two accounts cannot hold one phone number', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const phone_number = aNumber()
      await aUser(c, { phone_number })
      await assert.rejects(
        () => aUser(c, { phone_number }),
        /users_one_phone_number|duplicate key/,
        'a number identifies an account on sign-in; two would be an ambiguity'
      )
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})

test('the update writes the columns the change flow owns, and leaves the rest', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const built = await aUser(c)
      const phone_number = aNumber()

      const withPhone = await users.update(built.id, { phone_number, phone_number_verified: true }, c)
      assert.equal(withPhone?.phone_number, phone_number)
      assert.equal(withPhone?.phone_number_verified, true)
      assert.equal(withPhone?.email, built.email, 'an unnamed column is not touched')
      assert.equal(withPhone?.role, built.role)

      const withEmail = await users.update(
        built.id,
        { email: `moved-${built.id}@dorado.test`, emailVerified: true },
        c
      )
      assert.equal(withEmail?.email, `moved-${built.id}@dorado.test`)
      assert.equal(withEmail?.phone_number, phone_number, 'the phone survived the email change')

      const named = await users.update(built.id, { name: 'Renamed' }, c)
      assert.equal(named?.name, 'Renamed')
      assert.equal(named?.email, `moved-${built.id}@dorado.test`)
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})

test('an update of nothing changes nothing', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const built = await aUser(c)
      const same = await users.update(built.id, {}, c)
      assert.equal(same?.email, built.email)
      assert.equal(same?.name, built.name)
      assert.equal(await users.update('00000000-0000-4000-8000-0000000000ff', {}, c), undefined)
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})
