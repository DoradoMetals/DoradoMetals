import { test, afterAll, beforeEach } from 'vitest'
import assert from 'node:assert/strict'

import type { PoolClient } from 'pg'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser } from '#shared/testing/builders/index.ts'
import * as captcha from '#providers/security/turnstile/fake.ts'
import * as throttles from '#db/auth/throttles/repo.ts'
import * as rules from '#accounts/auth/rules.ts'
import * as service from '#accounts/auth/service.ts'
import { dispatched, restoreAuthApi, stubAuthApi } from '#accounts/auth/tests/harness.ts'

const KNOWN = '+15125551001'
const UNKNOWN = '+15125551002'
const IP = '203.0.113.7'

beforeEach(() => captcha.reset())
afterAll(() => {
  restoreAuthApi()
  captcha.reset()
})

const send = (channel: 'sms' | 'email', value: string, ip: string | null = IP) =>
  service.sendCode(
    channel === 'sms'
      ? { channel, phone_number: value, captcha_token: 't' }
      : { channel, email: value, captcha_token: 't' },
    ip
  )

// RULE 9: the captcha is on the send, and the token and caller's IP are what
// the provider is asked about.
test('the token and the IP reach the provider on every send', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      stubAuthApi(c)
      await aUser(c, { phone_number: KNOWN })
      await send('sms', KNOWN)
      assert.deepEqual(
        captcha.lastCheck() && [captcha.lastCheck()!.token, captcha.lastCheck()!.ip],
        ['t', IP]
      )
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})

// RULE 9: the captcha is on the send.
test('a captcha that does not pass refuses the send outright', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      stubAuthApi(c)
      captcha.next(false)
      await assert.rejects(() => send('sms', KNOWN), /captcha did not pass/)
      assert.deepEqual(dispatched, [], 'a failed captcha must not reach the provider')
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})

// RULE 9: US numbers only.
test('a number that is not a US number is refused before anything is minted', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      stubAuthApi(c)
      await assert.rejects(() => send('sms', '+447700900123'), /US number in E.164 form/)
      assert.deepEqual(dispatched, [])
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})

// RULE 2: free choice on sign-in.
test('the caller picks the channel, and the code goes down the one they picked', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      stubAuthApi(c)
      const user = await aUser(c, { phone_number: KNOWN })

      const byPhone = await send('sms', KNOWN)
      assert.deepEqual(dispatched, [{ channel: 'sms', to: KNOWN }])
      assert.equal(byPhone.channel, 'sms')
      assert.equal(byPhone.destination, '(•••) •••-1001')

      dispatched.length = 0
      const byEmail = await send('email', user.email)
      assert.deepEqual(dispatched, [{ channel: 'email', to: user.email }])
      assert.equal(byEmail.channel, 'email')
      assert.ok(byEmail.destination.startsWith(user.email.slice(0, 1) + '•••@'))
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})

// RULE 6: enumeration safety - the same body for a known and an unknown identity.
test('a known and an unknown number answer the same body, and only one is texted', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      stubAuthApi(c)
      await aUser(c, { phone_number: KNOWN })

      const known = await send('sms', KNOWN)
      const textedKnown = [...dispatched]
      dispatched.length = 0
      const unknown = await send('sms', UNKNOWN)

      assert.deepEqual(textedKnown, [{ channel: 'sms', to: KNOWN }])
      assert.deepEqual(dispatched, [], 'an unknown number is never texted: cost, and it is spam')

      assert.deepEqual(Object.keys(known).sort(), Object.keys(unknown).sort())
      assert.equal(known.status, unknown.status)
      assert.equal(known.purpose, unknown.purpose)
      assert.equal(known.channel, unknown.channel)
      assert.equal(known.code_length, unknown.code_length)
      assert.equal(known.attempts_remaining, unknown.attempts_remaining)
      assert.equal(known.locked_until, unknown.locked_until)
      assert.equal(
        known.destination.replace(/\d/g, '#'),
        unknown.destination.replace(/\d/g, '#'),
        'the masked shape must not say which of the two exists'
      )
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})

// RULE 6: and not distinguishable by latency either.
test('both branches answer at the constant-time floor', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      stubAuthApi(c)
      await aUser(c, { phone_number: KNOWN })

      const at = Date.now()
      await send('sms', KNOWN)
      const withSend = Date.now() - at

      const then = Date.now()
      await send('sms', UNKNOWN)
      const withoutSend = Date.now() - then

      assert.ok(withSend >= rules.SEND_FLOOR_MS - 20, `the known branch answered in ${withSend}ms`)
      assert.ok(
        withoutSend >= rules.SEND_FLOOR_MS - 20,
        `the unknown branch answered in ${withoutSend}ms, under the floor`
      )
      assert.ok(
        Math.abs(withSend - withoutSend) < 250,
        `${withSend}ms against ${withoutSend}ms - the difference names the account`
      )
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})

// RULE 9: the per-number send limit.
test('a number that has had its allowance is not texted again inside the window', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      stubAuthApi(c)
      await aUser(c, { phone_number: KNOWN })

      const subject = rules.subjectOf('phone', KNOWN)
      await throttles.create(subject, 'phone', c)
      await throttles.update(
        subject,
        {
          sends: rules.SENDS_PER_NUMBER,
          window_started_at: new Date().toISOString(),
          last_sent_at: new Date().toISOString(),
        },
        c
      )

      const view = await send('sms', KNOWN)
      assert.deepEqual(dispatched, [], 'the fourth send inside the window is not made')
      assert.equal(view.status, 'sent', 'and the answer says nothing about why')
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})

// RULE 9: the per-IP send limit, which is what an SMS pump runs into.
test('one IP working through many numbers stops at its own allowance', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      stubAuthApi(c)
      await aUser(c, { phone_number: KNOWN })

      const ipSubject = rules.subjectOf('ip', IP)
      await throttles.create(ipSubject, 'ip', c)
      await throttles.update(
        ipSubject,
        { sends: rules.SENDS_PER_IP, window_started_at: new Date().toISOString() },
        c
      )

      const view = await send('sms', KNOWN)
      assert.deepEqual(dispatched, [], 'a fresh number does not reset the IP allowance')
      assert.equal(view.status, 'sent')

      dispatched.length = 0
      await send('sms', KNOWN, null)
      assert.deepEqual(
        dispatched,
        [{ channel: 'sms', to: KNOWN }],
        'a caller behind no IP is still served'
      )
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})

// RULE 7: a locked identity is told so, with its cooldown.
test('a locked number answers the Locked screen and nothing is sent', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      stubAuthApi(c)
      await aUser(c, { phone_number: KNOWN })

      const subject = rules.subjectOf('phone', KNOWN)
      await throttles.create(subject, 'phone', c)
      const until = new Date(Date.now() + rules.LOCKOUT_SECONDS * 1000).toISOString()
      await throttles.update(subject, { attempts: rules.MAX_ATTEMPTS, locked_until: until }, c)

      const view = await send('sms', KNOWN)
      assert.equal(view.status, 'locked')
      assert.ok(view.locked_until, 'the Locked screen needs the cooldown to count down')
      assert.equal(view.attempts_remaining, 0)
      assert.deepEqual(dispatched, [])
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})

// RULE 8: nothing in the answer is a full value.
test('the view never carries a full number or a full address', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      stubAuthApi(c)
      const user = await aUser(c, { phone_number: KNOWN })
      const view = await send('email', user.email)
      const body = JSON.stringify(view)
      assert.ok(!body.includes(user.email), 'the address reached the wire in full')
      assert.ok(!body.includes(KNOWN))
      assert.ok(!body.includes('5551001'))
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})
