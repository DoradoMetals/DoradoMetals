import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'

import type { PoolClient } from 'pg'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser } from '#shared/testing/builders/index.ts'
import * as users from '#db/auth/users/repo.ts'
import * as pendingSignups from '#db/auth/pending-signups/repo.ts'
import * as authSessions from '#db/auth/sessions/repo.ts'
import * as verifications from '#db/auth/verification/repo.ts'
import * as rules from '#accounts/auth/rules.ts'
import * as service from '#accounts/auth/service.ts'
import {
  CODE,
  aSessionRow,
  mintFor,
  restoreAuthApi,
  stubAuthApi,
} from '#accounts/auth/tests/harness.ts'

const NUMBER = '+15125552001'
const WRONG = '000000'

afterAll(() => restoreAuthApi())

const verify = (code: string, session_id: string | null = null, number = NUMBER) =>
  service.verifyCode({ channel: 'sms', phone_number: number, code }, session_id)

test('a wrong code counts down, the fifth locks, and the lock outlives a right code', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      stubAuthApi(c)
      await aUser(c, { phone_number: NUMBER })
      await mintFor(c, NUMBER)

      for (let n = 1; n < rules.MAX_ATTEMPTS; n++) {
        const [view] = await verify(WRONG)
        assert.equal(view.status, 'invalid', `attempt ${n}`)
        assert.equal(view.attempts_remaining, rules.MAX_ATTEMPTS - n)
        assert.equal(view.locked_until, null)
      }

      const [locked] = await verify(WRONG)
      assert.equal(locked.status, 'locked')
      assert.equal(locked.attempts_remaining, 0)
      assert.ok(locked.locked_until, 'the Locked screen counts down from this')
      const cooldown = Date.parse(locked.locked_until as string) - Date.now()
      assert.ok(
        cooldown > (rules.LOCKOUT_SECONDS - 60) * 1000 && cooldown <= rules.LOCKOUT_SECONDS * 1000,
        `the cooldown was ${Math.round(cooldown / 1000)}s, not ${rules.LOCKOUT_SECONDS}s`
      )

      const [after, cookies] = await verify(CODE)
      assert.equal(after.status, 'locked', 'a lockout a right code clears is not a lockout')
      assert.deepEqual(cookies, [], 'and no session is minted through it')
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})

test('the right code verifies, mints a session cookie and clears the attempts', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      stubAuthApi(c)
      await aUser(c, { phone_number: NUMBER })
      await mintFor(c, NUMBER)

      const [missed] = await verify(WRONG)
      assert.equal(missed.attempts_remaining, rules.MAX_ATTEMPTS - 1)

      const [view, cookies] = await verify(CODE)
      assert.equal(view.status, 'verified')
      assert.equal(view.purpose, 'sign_in')
      assert.equal(view.attempts_remaining, rules.MAX_ATTEMPTS, 'a good code wipes the ladder')
      assert.equal(cookies.length, 1, 'the caller is signed in')
      assert.match(cookies[0]!, /session_token/)
      assert.equal(view.destination, '(•••) •••-2001', 'masked even on success')
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})

test('an expired code is not a right code', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      stubAuthApi(c)
      await aUser(c, { phone_number: NUMBER })
      await c.query(
        `INSERT INTO auth.verification (identifier, value, "expiresAt")
         VALUES ($1, $2, (now() at time zone 'UTC') - interval '1 minute')`,
        [NUMBER, `${CODE}:0`]
      )
      const [view] = await verify(CODE)
      assert.equal(view.status, 'invalid')
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})

test('a code for one number does not open another', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      stubAuthApi(c)
      await aUser(c, { phone_number: NUMBER })
      await mintFor(c, NUMBER)
      const [view] = await verify(CODE, null, '+15125552099')
      assert.equal(view.status, 'invalid')
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})

test('a sign-up verify creates the account and writes the real name and email', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      stubAuthApi(c)
      const number = '+15125552002'
      await service.signUp(
        {
          name: 'New Person',
          email: 'new-person@dorado.test',
          phone_number: number,
          accepted_terms: true,
          captcha_token: 't',
        },
        '203.0.113.9'
      )
      assert.ok(await pendingSignups.byPhone(number), 'the answers are held until the code is')

      const [view] = await service.verifyCode(
        { channel: 'sms', phone_number: number, code: CODE },
        null
      )
      assert.equal(view.status, 'verified')
      assert.equal(view.purpose, 'sign_up')

      const made = await users.byPhone(number)
      assert.ok(made, 'the verify is what creates the user')
      assert.equal(made.email, 'new-person@dorado.test', 'the temp email is replaced at once')
      assert.equal(made.name, 'New Person')
      assert.equal(made.phone_number_verified, true)
      assert.equal(await pendingSignups.byPhone(number), undefined, 'the held answers are cleared')
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})

test('a sign-up for a number that is already an account texts nothing and says the same thing', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      stubAuthApi(c)
      const number = '+15125552003'
      await aUser(c, { phone_number: number })
      const { dispatched } = await import('#accounts/auth/tests/harness.ts')
      dispatched.length = 0

      const view = await service.signUp(
        {
          name: 'Impostor',
          email: 'impostor@dorado.test',
          phone_number: number,
          accepted_terms: true,
          captcha_token: 't',
        },
        '203.0.113.9'
      )
      assert.deepEqual(dispatched, [], 'a taken number must not be told it is taken')
      assert.equal(view.status, 'sent')
      assert.equal(view.purpose, 'sign_up')
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})

test('a step-up code stamps the session rather than minting a new one', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      stubAuthApi(c)
      const user = await aUser(c, { phone_number: NUMBER })
      const session_id = await aSessionRow(c, user.id, 3600)
      assert.equal((await authSessions.getOne(session_id))?.stepped_up_at, null)

      const identifier = rules.identifierFor(rules.STEP_UP_OTP_TYPE, NUMBER)
      await mintFor(c, identifier)

      const [view, cookies] = await verify(CODE, session_id)
      assert.equal(view.purpose, 'step_up')
      assert.equal(view.status, 'verified')
      assert.deepEqual(cookies, [], 'a step-up proves the session it already has')

      const after = await authSessions.getOne(session_id)
      assert.ok(after?.stepped_up_at, 'the session was not stamped')
      assert.equal(rules.isFresh(after, Date.now()), true, 'and is fresh again')
      assert.equal(
        await verifications.byIdentifier(identifier),
        undefined,
        'a step-up code is single use'
      )
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})
