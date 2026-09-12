import { test, afterAll, beforeEach } from 'vitest'
import assert from 'node:assert/strict'

import type { PoolClient } from 'pg'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser } from '#shared/testing/builders/index.ts'
import * as fakeSms from '#providers/twilio/fake.ts'
import * as fakeEmail from '#providers/resend/fake.ts'
import * as users from '#db/auth/users/repo.ts'
import * as pendingChanges from '#db/auth/pending-changes/repo.ts'
import * as authSessions from '#db/auth/sessions/repo.ts'
import * as verifications from '#db/auth/verification/repo.ts'
import * as rules from '#accounts/auth/rules.ts'
import * as service from '#accounts/auth/service.ts'
import { CODE, aSessionRow, restoreAuthApi, stubAuthApi } from '#accounts/auth/tests/harness.ts'

const IP = '203.0.113.11'

beforeEach(() => {
  fakeSms.reset()
  fakeEmail.reset()
})
afterAll(() => {
  restoreAuthApi()
  fakeSms.reset()
  fakeEmail.reset()
})

const aCustomer = async (c: PoolClient, phone_number: string, agoSeconds = 0) => {
  const user = await aUser(c, { phone_number })
  await c.query(`UPDATE auth.users SET phone_number_verified = true WHERE id = $1`, [user.id])
  return { user, session_id: await aSessionRow(c, user.id, agoSeconds) }
}

const codeMintedFor = async (value: string): Promise<boolean> =>
  Boolean(await verifications.byIdentifier(rules.identifierFor(rules.CHANGE_OTP_TYPE, value)))

test('an email change texts the phone and does not mail either address', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      stubAuthApi(c)
      const phone = '+15125553001'
      const { user, session_id } = await aCustomer(c, phone)

      const view = await service.changeEmail(user.id, session_id, 'moved@dorado.test', IP)

      assert.equal(view.purpose, 'change_email')
      assert.equal(view.channel, 'sms', 'the OTHER factor carries the code')
      assert.equal(view.destination, '(•••) •••-3001', 'and it is masked')

      const texted = fakeSms.lastMessageTo(phone)
      assert.ok(texted, 'the phone was not texted')
      assert.match(texted.body, new RegExp(CODE))
      assert.equal(await codeMintedFor(phone), true, 'the code is bound to the phone')
      assert.equal(await codeMintedFor(user.email), false, 'and to nothing else')
      assert.equal(await codeMintedFor('moved@dorado.test'), false)

      const open = await pendingChanges.openFor(user.id)
      assert.equal(open?.factor, 'email')
      assert.equal(open?.next_value, 'moved@dorado.test')
      assert.equal(open?.verified_via, 'sms')
      assert.equal(open?.sent_to, phone)
      assert.equal(
        (await users.getOne(user.id))?.email,
        user.email,
        'the account does not change before the code is answered'
      )
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})

test('a phone change mails the email and does not text either number', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      stubAuthApi(c)
      const phone = '+15125553002'
      const { user, session_id } = await aCustomer(c, phone)

      const view = await service.changePhone(user.id, session_id, '+15125553999', IP)

      assert.equal(view.purpose, 'change_phone')
      assert.equal(view.channel, 'email', 'the OTHER factor carries the code')
      assert.ok(view.destination.startsWith(user.email.slice(0, 1) + '•••@'))

      assert.equal(await codeMintedFor(user.email), true, 'the code is bound to the email')
      assert.equal(await codeMintedFor(phone), false, 'and not to the old number')
      assert.equal(await codeMintedFor('+15125553999'), false, 'nor to the new one')
      assert.equal(fakeSms.lastMessageTo(phone), null, 'the old number must not be texted')
      assert.equal(fakeSms.lastMessageTo('+15125553999'), null, 'nor the new one')

      const open = await pendingChanges.openFor(user.id)
      assert.equal(open?.verified_via, 'email')
      assert.equal(open?.sent_to, user.email)
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})

test('a stale session is sent to step-up; a fresh one goes straight through', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      stubAuthApi(c)
      const stale = await aCustomer(c, '+15125553003', rules.STEP_UP_FRESH_SECONDS + 60)
      await assert.rejects(
        () => service.changeEmail(stale.user.id, stale.session_id, 'a@dorado.test', IP),
        /step_up_required/
      )

      const fresh = await aCustomer(c, '+15125553004', 10)
      const view = await service.changeEmail(fresh.user.id, fresh.session_id, 'b@dorado.test', IP)
      assert.equal(view.purpose, 'change_email', 'a session minutes old is proof enough')
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})

test('a step-up code texts the phone, and the change it unblocks then goes through', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      stubAuthApi(c)
      const phone = '+15125553005'
      const { user, session_id } = await aCustomer(c, phone, rules.STEP_UP_FRESH_SECONDS + 60)

      const asked = await service.stepUp(user.id, session_id, IP)
      assert.equal(asked.purpose, 'step_up')
      assert.equal(asked.channel, 'sms')
      assert.equal(asked.destination, '(•••) •••-3005')
      assert.ok(fakeSms.lastMessageTo(phone), 'the step-up code was not delivered')

      const [proved] = await service.verifyCode(
        { channel: 'sms', phone_number: phone, code: CODE },
        session_id
      )
      assert.equal(proved.purpose, 'step_up')
      assert.equal(proved.status, 'verified')

      const view = await service.changeEmail(user.id, session_id, 'after-step-up@dorado.test', IP)
      assert.equal(view.purpose, 'change_email', 'the step-up is what made this reachable')
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})

test('confirming a phone change applies it, texts the OLD number, and answers in full', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      stubAuthApi(c)
      const oldPhone = '+15125553006'
      const newPhone = '+15125553007'
      const { user, session_id } = await aCustomer(c, oldPhone)

      await service.changePhone(user.id, session_id, newPhone, IP)
      const confirmed = await service.confirmChange(user.id, session_id, { code: CODE })

      assert.equal(confirmed.factor, 'phone')
      assert.equal(confirmed.next_value, newPhone, "the caller's own new value, unmasked")
      assert.equal(confirmed.previous_notified, true)

      const after = await users.getOne(user.id)
      assert.equal(after?.phone_number, newPhone)
      assert.equal(after?.phone_number_verified, true)

      const alarm = fakeSms.lastMessageTo(oldPhone)
      assert.ok(alarm, 'the takeover alarm never reached the number being replaced')
      assert.match(alarm.body, /phone number was changed/i)
      assert.equal(fakeSms.lastCodeTo(oldPhone), null, 'the alarm is not a code')

      const open = await pendingChanges.openFor(user.id)
      assert.equal(open, undefined, 'the change is closed')
      assert.equal(
        await verifications.byIdentifier(rules.identifierFor(rules.CHANGE_OTP_TYPE, user.email)),
        undefined,
        'the code is single use'
      )
      assert.equal((await authSessions.getOne(session_id))?.factor_changed, 'phone')
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})

test('an email change notifies the old address through the recording fake', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      stubAuthApi(c)
      const { user, session_id } = await aCustomer(c, '+15125553008')
      const previous = user.email

      await service.changeEmail(user.id, session_id, 'now-mine@dorado.test', IP)
      const confirmed = await service.confirmChange(user.id, session_id, { code: CODE })

      assert.equal(confirmed.next_value, 'now-mine@dorado.test')
      assert.equal(confirmed.previous_notified, true, 'the notice delivered through the fake')
      assert.equal(
        (await users.getOne(user.id))?.email,
        'now-mine@dorado.test',
        'the change did not stand'
      )

      const alarm = fakeEmail.lastMessageTo(previous)
      assert.ok(alarm, 'the takeover alarm never reached the address being replaced')
      assert.match(alarm.html, /email address changed/i)

      const texts = fakeSms.sent().filter((m) => m.to === '+15125553008')
      assert.equal(
        texts.length,
        1,
        'the phone was texted twice; the alarm went to the wrong factor'
      )
      assert.match(texts[0]!.body, new RegExp(CODE))
      assert.ok(previous.includes('@'), 'the replaced value was an address')
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})

test('a session that changed one factor may not change the other', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      stubAuthApi(c)
      const { user, session_id } = await aCustomer(c, '+15125553009')

      await service.changeEmail(user.id, session_id, 'first@dorado.test', IP)
      await service.confirmChange(user.id, session_id, { code: CODE })

      await assert.rejects(
        () => service.changePhone(user.id, session_id, '+15125553010', IP),
        /already changed a factor/
      )
      await assert.rejects(
        () => service.changeEmail(user.id, session_id, 'second@dorado.test', IP),
        /already changed a factor/
      )
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})

test('a wrong confirmation code is refused, and enough of them lock the identity', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      stubAuthApi(c)
      const { user, session_id } = await aCustomer(c, '+15125553011')
      await service.changeEmail(user.id, session_id, 'nope@dorado.test', IP)

      for (let n = 1; n < rules.MAX_ATTEMPTS; n++) {
        await assert.rejects(
          () => service.confirmChange(user.id, session_id, { code: '000000' }),
          /not right/,
          `attempt ${n}`
        )
      }
      await assert.rejects(
        () => service.confirmChange(user.id, session_id, { code: '000000' }),
        /too many wrong codes/
      )
      await assert.rejects(
        () => service.confirmChange(user.id, session_id, { code: CODE }),
        /too many wrong codes/,
        'the lock holds against the right code too'
      )
      assert.equal(
        (await users.getOne(user.id))?.email,
        user.email,
        'nothing changed on the way through'
      )
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})

test('a change is refused when the value is unusable, taken, or already the one held', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      stubAuthApi(c)
      const { user, session_id } = await aCustomer(c, '+15125553012')
      const other = await aUser(c, { phone_number: '+15125553013' })

      await assert.rejects(
        () => service.changeEmail(user.id, session_id, user.email.toUpperCase(), IP),
        /already the value/
      )
      await assert.rejects(
        () => service.changeEmail(user.id, session_id, other.email, IP),
        /another account/
      )
      await assert.rejects(
        () => service.changePhone(user.id, session_id, '+447700900123', IP),
        /US number in E.164 form/
      )
      await assert.rejects(
        () => service.changePhone(user.id, session_id, '+15125553013', IP),
        /another account/
      )
      assert.equal(await pendingChanges.openFor(user.id), undefined, 'nothing was asserted')
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})

test('a change is refused while the other factor is unproved', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      stubAuthApi(c)
      const user = await aUser(c, { phone_number: '+15125553014' })
      const session_id = await aSessionRow(c, user.id, 0)

      await assert.rejects(
        () => service.changeEmail(user.id, session_id, 'x@dorado.test', IP),
        /verify a phone number/,
        'an unproved number cannot vouch for an email change'
      )
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})

test('the session view masks both values and reports its own freshness', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      stubAuthApi(c)
      const phone = '+15125553015'
      const { user, session_id } = await aCustomer(c, phone)

      const view = await service.sessionOf(user.id, session_id)
      assert.equal(view.user_id, user.id)
      assert.equal(view.phone_number, '(•••) •••-3015')
      assert.ok(!JSON.stringify(view).includes(user.email))
      assert.ok(!JSON.stringify(view).includes(phone))
      assert.equal(view.phone_number_verified, true)
      assert.equal(view.fresh, true)
      assert.equal(view.factor_changed, null)

      const stale = await aCustomer(c, '+15125553016', rules.STEP_UP_FRESH_SECONDS + 60)
      const old = await service.sessionOf(stale.user.id, stale.session_id)
      assert.equal(old.fresh, false, 'a stale session says so, so the UI can offer step-up')
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})
