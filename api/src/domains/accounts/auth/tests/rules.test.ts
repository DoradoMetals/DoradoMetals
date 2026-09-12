import { test } from 'vitest'
import assert from 'node:assert/strict'
import * as rules from '#accounts/auth/rules.ts'
import type { AuthOtpThrottle, Session, User } from '@dorado/contracts'

const NOW = Date.parse('2026-09-06T12:00:00Z')
const secondsAgo = (s: number) => new Date(NOW - s * 1000).toISOString()
const secondsAway = (s: number) => new Date(NOW + s * 1000).toISOString()

const aThrottle = (over: Partial<AuthOtpThrottle> = {}): AuthOtpThrottle =>
  Object.assign(
    {
      id: '00000000-0000-4000-8000-000000000001',
      subject: 'phone:+15125550134',
      kind: 'phone',
      sends: 0,
      window_started_at: null,
      attempts: 0,
      locked_until: null,
      last_sent_at: null,
      created_at: secondsAgo(0),
      updated_at: secondsAgo(0),
      created_by_id: null,
      updated_by_id: null,
    } as AuthOtpThrottle,
    over
  )

const aSession = (over: Partial<Session> = {}): Session =>
  Object.assign(
    {
      id: '00000000-0000-4000-8000-000000000002',
      userId: '00000000-0000-4000-8000-000000000003',
      token: 't',
      expiresAt: secondsAway(3600),
      createdAt: secondsAgo(10),
      updatedAt: secondsAgo(10),
      ipAddress: null,
      userAgent: null,
      impersonatedBy: null,
      factor_changed: null,
      stepped_up_at: null,
    } as Session,
    over
  )

const aUser = (over: Partial<User> = {}): User =>
  Object.assign(
    {
      id: '00000000-0000-4000-8000-000000000003',
      email: 'jacob@doradometals.com',
      name: 'Jacob',
      createdAt: secondsAgo(0),
      updatedAt: secondsAgo(0),
      emailVerified: true,
      image: null,
      role: 'user',
      stripeCustomerId: null,
      dorado_funds: 0,
      banned: null,
      banReason: null,
      banExpires: null,
      phone_number: '+15125550134',
      isAnonymous: false,
      phone_number_verified: true,
    } as User,
    over
  )

test('a US E.164 number is accepted and everything else is refused', () => {
  assert.equal(rules.isUsPhone('+15125550134'), true)
  assert.equal(rules.isUsPhone('+15555550100'), true, 'the e2e numbers must pass')
  for (const bad of [
    '+445125550134',
    '5125550134',
    '+1512555013',
    '+15125550134 ',
    '+11125550134',
    '+1512155013a',
    '',
  ]) {
    assert.equal(rules.isUsPhone(bad), false, `${bad} was accepted`)
    assert.throws(() => rules.assertUsPhone(bad), /US number in E.164 form/)
  }
})

test('the destination comes from the channel the caller picked', () => {
  assert.equal(rules.destinationOf('sms', '+15125550134', null), '+15125550134')
  assert.equal(rules.destinationOf('email', null, 'Jacob@Example.COM'), 'jacob@example.com')
  assert.throws(() => rules.destinationOf('sms', null, 'a@b.com'), /phone number is required/)
  assert.throws(
    () => rules.destinationOf('email', '+15125550134', null),
    /email address is required/
  )
})

test('a change is verified through the other factor, and the caller does not choose', () => {
  assert.equal(rules.otherFactorOf('email'), 'phone')
  assert.equal(rules.otherFactorOf('phone'), 'email')
  assert.equal(rules.channelOf(rules.otherFactorOf('email')), 'sms')
  assert.equal(rules.channelOf(rules.otherFactorOf('phone')), 'email')

  const user = aUser()
  assert.equal(rules.carrierFor(user, 'email'), user.phone_number, 'an email change texts')
  assert.equal(rules.carrierFor(user, 'phone'), user.email, 'a phone change emails')
})

test('a change is refused when the other factor is missing or unproved', () => {
  assert.throws(
    () => rules.assertOtherFactorVerified(aUser({ phone_number_verified: false }), 'email'),
    /verify a phone number/
  )
  assert.throws(
    () => rules.assertOtherFactorVerified(aUser({ phone_number: null }), 'email'),
    /verify a phone number/
  )
  assert.throws(
    () => rules.assertOtherFactorVerified(aUser({ emailVerified: false }), 'phone'),
    /verify the email address/
  )
  rules.assertOtherFactorVerified(aUser(), 'email')
  rules.assertOtherFactorVerified(aUser(), 'phone')
})

test('a session is fresh for five minutes from whichever proof is later', () => {
  assert.equal(rules.STEP_UP_FRESH_SECONDS, 5 * 60)
  assert.equal(rules.isFresh(aSession({ createdAt: secondsAgo(10) }), NOW), true)
  assert.equal(rules.isFresh(aSession({ createdAt: secondsAgo(301) }), NOW), false)
  assert.equal(
    rules.isFresh(aSession({ createdAt: secondsAgo(3600), stepped_up_at: secondsAgo(10) }), NOW),
    true,
    'a step-up is what makes a stale session fresh again'
  )
  assert.throws(
    () => rules.assertFresh(aSession({ createdAt: secondsAgo(301) }), NOW),
    /step_up_required/
  )
  rules.assertFresh(aSession(), NOW)
})

test('a session that changed one factor may not change the other', () => {
  rules.assertFactorNotChanged(aSession())
  assert.throws(
    () => rules.assertFactorNotChanged(aSession({ factor_changed: 'email' })),
    /already changed a factor/
  )
  assert.throws(
    () => rules.assertFactorNotChanged(aSession({ factor_changed: 'phone' })),
    /already changed a factor/
  )
})

test('the attempt ladder locks at MAX_ATTEMPTS and the lock carries a cooldown', () => {
  assert.equal(rules.MAX_ATTEMPTS, 5)
  assert.equal(rules.LOCKOUT_SECONDS, 15 * 60)

  let row = aThrottle()
  for (let n = 1; n < rules.MAX_ATTEMPTS; n++) {
    row = aThrottle(rules.nextAttempt(row, NOW))
    assert.equal(row.attempts, n)
    assert.equal(rules.isLocked(row, NOW), false, `locked early, at ${n} attempts`)
    assert.equal(rules.attemptsRemaining(row, NOW), rules.MAX_ATTEMPTS - n)
  }
  row = aThrottle(rules.nextAttempt(row, NOW))
  assert.equal(rules.isLocked(row, NOW), true, 'the fifth miss locks')
  assert.equal(rules.attemptsRemaining(row, NOW), 0)
  assert.equal(
    rules.lockedUntil(row, NOW),
    new Date(NOW + rules.LOCKOUT_SECONDS * 1000).toISOString()
  )
  assert.equal(
    rules.isLocked(row, NOW + rules.LOCKOUT_SECONDS * 1000 + 1),
    false,
    'the cooldown ends'
  )
  assert.equal(rules.clearedAttempts().attempts, 0)
  assert.equal(rules.clearedAttempts().locked_until, null)
})

test('a send window counts up to its limit and then starts again when it runs out', () => {
  const w = rules.NUMBER_WINDOW_SECONDS
  let row = aThrottle()
  for (let n = 1; n <= rules.SENDS_PER_NUMBER; n++) {
    assert.equal(rules.withinSendLimit(row, NOW, rules.SENDS_PER_NUMBER, w), true, `send ${n}`)
    row = aThrottle(rules.nextSend(row, NOW, w))
    assert.equal(row.sends, n)
  }
  assert.equal(rules.withinSendLimit(row, NOW, rules.SENDS_PER_NUMBER, w), false, 'the fourth send')
  assert.equal(
    rules.withinSendLimit(row, NOW + (w + 1) * 1000, rules.SENDS_PER_NUMBER, w),
    true,
    'a window that has run out lets the next send through'
  )
  assert.equal(rules.nextSend(row, NOW + (w + 1) * 1000, w).sends, 1, 'and starts the count again')
  assert.equal(rules.SENDS_PER_NUMBER, 3)
  assert.equal(rules.SENDS_PER_IP, 10)
  assert.equal(rules.IP_WINDOW_SECONDS, 3600)
})

test('the ip subject and the identity subject can never share a row', () => {
  assert.equal(rules.subjectOf('phone', '+15125550134'), 'phone:+15125550134')
  assert.equal(rules.subjectOf('email', 'Jacob@Example.com'), 'email:jacob@example.com')
  assert.equal(rules.subjectOf('ip', '203.0.113.7'), 'ip:203.0.113.7')
})

test('a code matches only while it is the minted one and has not expired', () => {
  const row = {
    id: 'v',
    identifier: 'i',
    value: '418209:0',
    expiresAt: secondsAway(60),
    createdAt: secondsAgo(0),
    updatedAt: secondsAgo(0),
  }
  assert.equal(rules.codeMatches(row, '418209', NOW), true)
  assert.equal(rules.codeMatches(row, '418208', NOW), false)
  assert.equal(rules.codeMatches({ ...row, expiresAt: secondsAgo(1) }, '418209', NOW), false)
  assert.equal(rules.codeMatches(undefined, '418209', NOW), false)
  assert.equal(
    rules.codeMatches({ ...row, value: ':0' }, '', NOW),
    false,
    'an empty code is not a code'
  )
})

test('every view masks, and only the confirmed view carries the new value in full', () => {
  const view = rules.verificationView('sign_in', 'sms', '+15125550134', aThrottle(), 'sent', NOW)
  assert.equal(view.destination, '(•••) •••-0134')
  assert.ok(!view.destination.includes('5125550134'))
  assert.equal(view.code_length, rules.OTP_LENGTH)
  assert.equal(view.expires_at, new Date(NOW + rules.OTP_EXPIRES_SECONDS * 1000).toISOString())
  assert.equal(view.attempts_remaining, rules.MAX_ATTEMPTS)
  assert.equal(view.locked_until, null)
  assert.equal(view.status, 'sent')

  const email = rules.verificationView(
    'sign_in',
    'email',
    'jacob@doradometals.com',
    aThrottle(),
    'sent',
    NOW
  )
  assert.equal(email.destination, 'j•••@doradometals.com')

  const confirmed = rules.changeConfirmedView('email', 'new@doradometals.com', true)
  assert.equal(confirmed.next_value, 'new@doradometals.com', "the caller's own new value, in full")

  const session = rules.sessionView(aUser(), aSession(), NOW)
  assert.equal(session.email, 'j•••@doradometals.com')
  assert.equal(session.phone_number, '(•••) •••-0134')
  assert.equal(session.fresh, true)
  assert.equal(session.factor_changed, null)
  assert.equal(rules.sessionView(aUser({ phone_number: null }), aSession(), NOW).phone_number, null)
})

test('the resend clock is thirty seconds after the last send', () => {
  assert.equal(rules.RESEND_SECONDS, 30)
  const row = aThrottle({ last_sent_at: secondsAgo(0) })
  assert.equal(rules.resendAt(row, NOW), new Date(NOW + 30_000).toISOString())
  assert.equal(rules.resendAt(aThrottle(), NOW), new Date(NOW).toISOString())
})

test('a wrong or locked code is refused rather than answered', () => {
  rules.assertCodeAccepted('verified')
  assert.throws(() => rules.assertCodeAccepted('invalid'), /not right/)
  assert.throws(() => rules.assertCodeAccepted('locked'), /15 minutes/)
})

test('the constants are the ones the design names', () => {
  assert.equal(rules.OTP_LENGTH, 6)
  assert.equal(rules.OTP_EXPIRES_SECONDS, 600)
  assert.equal(rules.SEND_FLOOR_MS, 600)
  assert.ok(rules.PLUGIN_ALLOWED_ATTEMPTS > rules.MAX_ATTEMPTS)
})

test('the identifier a code is stored under is the value it was sent to', () => {
  assert.equal(
    rules.identifierFor(rules.CHANGE_OTP_TYPE, 'Jacob@Example.com'),
    'change-email-otp-jacob@example.com'
  )
  assert.equal(
    rules.identifierFor(rules.STEP_UP_OTP_TYPE, '+15125550134'),
    'email-verification-otp-+15125550134'
  )
  assert.notEqual(
    rules.STEP_UP_OTP_TYPE,
    rules.CHANGE_OTP_TYPE,
    'a step-up code must not open a change'
  )
  assert.notEqual(rules.SIGN_IN_OTP_TYPE, rules.STEP_UP_OTP_TYPE)
})

test('a sign-up mints a temporary email that cannot be a real address', () => {
  assert.equal(rules.temporaryEmailFor('+15125550134'), '15125550134@phone.dorado.invalid')
})

test('the step-up code goes to the phone when it is proved, and to the email otherwise', () => {
  assert.equal(rules.stepUpChannel(aUser()), 'sms')
  assert.equal(rules.stepUpDestination(aUser()), '+15125550134')
  assert.equal(rules.stepUpChannel(aUser({ phone_number_verified: false })), 'email')
  assert.equal(rules.stepUpDestination(aUser({ phone_number: null })), 'jacob@doradometals.com')
})

test('a value that is already on the account, or on another one, is refused', () => {
  assert.throws(() => rules.assertDifferent('a@b.com', 'A@B.com'), /already the value/)
  rules.assertDifferent('a@b.com', 'c@d.com')
  rules.assertAvailable(undefined, 'me')
  rules.assertAvailable(aUser({ id: 'me' }), 'me')
  assert.throws(() => rules.assertAvailable(aUser({ id: 'other' }), 'me'), /another account/)
})

test('an expired or absent change cannot be confirmed', () => {
  const open = {
    id: 'p',
    user_id: 'u',
    factor: 'email' as const,
    next_value: 'new@x.com',
    verified_via: 'sms' as const,
    sent_to: '+15125550134',
    expires_at: secondsAway(60),
    confirmed_at: null,
    created_at: secondsAgo(0),
    updated_at: secondsAgo(0),
    created_by_id: null,
    updated_by_id: null,
  }
  rules.assertOpenChange(open, NOW)
  assert.throws(() => rules.assertOpenChange(undefined, NOW), /no change waiting/)
  assert.throws(
    () => rules.assertOpenChange({ ...open, expires_at: secondsAgo(1) }, NOW),
    /expired/
  )
})

test('the confirmed patch writes one factor and proves it in the same statement', () => {
  assert.deepEqual(rules.confirmedUserPatch('email', 'new@x.com'), {
    email: 'new@x.com',
    emailVerified: true,
  })
  assert.deepEqual(rules.confirmedUserPatch('phone', '+15125550134'), {
    phone_number: '+15125550134',
    phone_number_verified: true,
  })
})

test('the captcha is a refusal, not a warning', () => {
  rules.assertCaptcha(true)
  assert.throws(() => rules.assertCaptcha(false), /captcha did not pass/)
})

test('captchaRequired is true with no row and true again once the pending code expires', () => {
  assert.equal(rules.captchaRequired(undefined, NOW), true, 'a first send always needs a token')

  const justSent = aThrottle({ last_sent_at: secondsAgo(0) })
  assert.equal(
    rules.captchaRequired(justSent, NOW),
    false,
    'a resend inside the pending window needs none'
  )

  const almostExpired = aThrottle({ last_sent_at: secondsAgo(rules.OTP_EXPIRES_SECONDS - 1) })
  assert.equal(
    rules.captchaRequired(almostExpired, NOW),
    false,
    'one second inside the window is still pending'
  )

  const atBoundary = aThrottle({ last_sent_at: secondsAgo(rules.OTP_EXPIRES_SECONDS) })
  assert.equal(
    rules.captchaRequired(atBoundary, NOW),
    true,
    'the expiry instant itself counts as expired'
  )

  const expired = aThrottle({ last_sent_at: secondsAgo(rules.OTP_EXPIRES_SECONDS + 1) })
  assert.equal(
    rules.captchaRequired(expired, NOW),
    true,
    'a resend after the code has expired needs one again'
  )
})
