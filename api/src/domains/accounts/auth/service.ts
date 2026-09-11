import withTransaction from '#shared/db/withTransaction.ts'
import { attempt } from '#shared/attempt.ts'
import { padTo } from '#shared/time/floor.ts'
import * as captcha from '#providers/captcha/index.ts'
import * as sms from '#providers/sms/index.ts'
import * as fakeSms from '#providers/sms/fake.ts'
import * as fakeEmail from '#providers/emails/fake.ts'
import * as throttles from '#db/auth/throttles/repo.ts'
import * as pendingChanges from '#db/auth/pending-changes/repo.ts'
import * as pendingSignups from '#db/auth/pending-signups/repo.ts'
import * as verifications from '#db/auth/verification/repo.ts'
import * as users from '#db/auth/users/repo.ts'
import * as authSessions from '#db/auth/sessions/repo.ts'
import * as rules from '#accounts/auth/rules.ts'
import { auth } from '#accounts/auth/client.ts'
import { sendAccountCreated, sendDetailsChanged, sendSignInCode } from '#documents/emails/service.ts'
import { detailsChangedRows } from '#documents/emails/rules.ts'
import type {
  AuthOtpThrottle,
  ChangeConfirmedView,
  ConfirmChangeBody,
  Factor,
  OtpChannel,
  SendCodeBody,
  SessionView,
  SignUpBody,
  ThrottleKind,
  User,
  VerificationStatus,
  VerificationView,
  VerifyCodeBody,
} from '@dorado/contracts'

// One SMS/email send, counted against the identity and against the caller's IP
// in the same transaction, with both rows taken in a fixed order so two
// requests for one number queue rather than race. The boolean is whether the
// send may happen; the row is what the view reports.
async function reserveSend(
  subject: string,
  kind: ThrottleKind,
  ip: string | null,
  limit: number,
  windowSeconds: number
): Promise<[AuthOtpThrottle, boolean]> {
  const now = Date.now()
  const ipSubject = ip ? rules.subjectOf('ip', ip) : null
  const wanted = ipSubject && ipSubject !== subject ? [subject, ipSubject].sort() : [subject]

  return await withTransaction(async (tx): Promise<[AuthOtpThrottle, boolean]> => {
    let own: AuthOtpThrottle | undefined
    let byIp: AuthOtpThrottle | undefined
    for (const each of wanted) {
      const seeded = await throttles.create(each, each === subject ? kind : 'ip', tx)
      const row = (await throttles.lock(each, tx)) ?? seeded
      if (each === subject) own = row
      else byIp = row
    }
    rules.assertThrottle(own)

    const may =
      !rules.isLocked(own, now) &&
      rules.withinSendLimit(own, now, limit, windowSeconds) &&
      (!byIp || rules.withinSendLimit(byIp, now, rules.SENDS_PER_IP, rules.IP_WINDOW_SECONDS))

    if (!may) return [own, false]

    const counted = await throttles.update(subject, rules.nextSend(own, now, windowSeconds), tx)
    if (byIp) {
      await throttles.update(
        byIp.subject,
        rules.nextSend(byIp, now, rules.IP_WINDOW_SECONDS),
        tx
      )
    }
    return [counted ?? own, true]
  })
}

// better-auth mints every code; this only chooses which of its two senders
// carries it (ruling 92).
async function dispatchSignIn(channel: OtpChannel, destination: string): Promise<void> {
  if (channel === 'sms') {
    await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: destination } })
    return
  }
  await auth.api.sendVerificationOTP({
    body: { email: destination, type: rules.SIGN_IN_OTP_TYPE },
  })
}

async function mintCode(
  type: 'change-email' | 'email-verification',
  destination: string
): Promise<string> {
  return await auth.api.createVerificationOTP({ body: { email: destination, type } })
}

async function deliverCode(
  channel: OtpChannel,
  destination: string,
  user: User,
  code: string
): Promise<void> {
  if (channel === 'sms') {
    await sms.send(
      destination,
      `${code} is your Dorado Metals code. It expires in ` +
        `${rules.OTP_EXPIRES_SECONDS / 60} minutes.`
    )
    return
  }
  await sendSignInCode({
    order_id: null,
    user_id: user.id,
    email: destination,
    name: user.name,
    code,
    expires_in_minutes: rules.OTP_EXPIRES_SECONDS / 60,
  })
}

// --------------------------------------------------------------- the sign-in

export async function sendCode(body: SendCodeBody, ip: string | null): Promise<VerificationView> {
  const started = Date.now()
  rules.assertCaptcha(await captcha.verify(body.captcha_token, ip))

  const destination = rules.destinationOf(
    body.channel,
    body.phone_number ?? null,
    body.email ?? null
  )
  const kind = rules.kindOf(body.channel)
  const known =
    body.channel === 'sms' ? await users.byPhone(destination) : await users.byEmail(destination)

  const [row, may] = await reserveSend(
    rules.subjectOf(kind, destination),
    kind,
    ip,
    rules.SENDS_PER_NUMBER,
    rules.NUMBER_WINDOW_SECONDS
  )

  // An unknown identity is never texted: it costs money and it is spam. The
  // body, the status and the timing are the same either way.
  if (may && known) {
    await attempt('auth.sendCode', () => dispatchSignIn(body.channel, destination))
  }
  await padTo(started, rules.SEND_FLOOR_MS)

  const now = Date.now()
  const status: VerificationStatus = rules.isLocked(row, now) ? 'locked' : 'sent'
  return rules.verificationView('sign_in', body.channel, destination, row, status, now)
}

export async function signUp(body: SignUpBody, ip: string | null): Promise<VerificationView> {
  const started = Date.now()
  rules.assertCaptcha(await captcha.verify(body.captcha_token, ip))
  rules.assertUsPhone(body.phone_number)

  const email = body.email.toLowerCase()
  const takenPhone = await users.byPhone(body.phone_number)
  const takenEmail = await users.byEmail(email)

  const [row, may] = await reserveSend(
    rules.subjectOf('phone', body.phone_number),
    'phone',
    ip,
    rules.SENDS_PER_NUMBER,
    rules.NUMBER_WINDOW_SECONDS
  )

  await withTransaction(async (tx) =>
    pendingSignups.create(
      {
        phone_number: body.phone_number,
        email,
        name: body.name,
        expires_at: rules.otpExpiresAt(Date.now()),
      },
      tx
    )
  )

  if (may && !takenPhone && !takenEmail) {
    await attempt('auth.signUp', () => dispatchSignIn('sms', body.phone_number))
  }
  await padTo(started, rules.SEND_FLOOR_MS)

  const now = Date.now()
  const status: VerificationStatus = rules.isLocked(row, now) ? 'locked' : 'sent'
  return rules.verificationView('sign_up', 'sms', body.phone_number, row, status, now)
}

// The purpose is not on the wire: it is read off the state. A signed-in caller
// with a step-up code outstanding is stepping up; a known identity is signing
// in; a number with a pending signup is signing up.
async function checkCode(
  subject: string,
  kind: ThrottleKind,
  identifier: string,
  code: string
): Promise<[AuthOtpThrottle, VerificationStatus]> {
  return await withTransaction(async (tx): Promise<[AuthOtpThrottle, VerificationStatus]> => {
    const seeded = await throttles.create(subject, kind, tx)
    const row = (await throttles.lock(subject, tx)) ?? seeded
    const now = Date.now()

    if (rules.isLocked(row, now)) return [row, 'locked']

    const minted = await verifications.byIdentifier(identifier, tx)
    if (rules.codeMatches(minted, code, now)) {
      const cleared = await throttles.update(subject, rules.clearedAttempts(), tx)
      return [cleared ?? row, 'verified']
    }

    const missed = await throttles.update(subject, rules.nextAttempt(row, now), tx)
    const after = missed ?? row
    return [after, rules.isLocked(after, now) ? 'locked' : 'invalid']
  })
}

export async function verifyCode(
  body: VerifyCodeBody,
  session_id: string | null
): Promise<[VerificationView, string[]]> {
  const destination = rules.destinationOf(
    body.channel,
    body.phone_number ?? null,
    body.email ?? null
  )
  const kind = rules.kindOf(body.channel)
  const subject = rules.subjectOf(kind, destination)

  const stepUpIdentifier = rules.identifierFor(rules.STEP_UP_OTP_TYPE, destination)
  const stepUpOutstanding = session_id
    ? await verifications.byIdentifier(stepUpIdentifier)
    : undefined

  const known =
    body.channel === 'sms' ? await users.byPhone(destination) : await users.byEmail(destination)
  const pending = body.channel === 'sms' ? await pendingSignups.byPhone(destination) : undefined

  const stepping = Boolean(session_id && stepUpOutstanding)
  const purpose = stepping ? 'step_up' : known || !pending ? 'sign_in' : 'sign_up'
  const identifier = stepping
    ? stepUpIdentifier
    : body.channel === 'sms'
      ? destination
      : rules.identifierFor(rules.SIGN_IN_OTP_TYPE, destination)

  const [row, status] = await checkCode(subject, kind, identifier, body.code)
  const now = Date.now()
  if (status !== 'verified') {
    return [rules.verificationView(purpose, body.channel, destination, row, status, now), []]
  }

  if (stepping && session_id) {
    await withTransaction(async (tx) => {
      const spent = await verifications.remove(identifier, tx)
      rules.assertApplied(spent, 'the step-up code')
      const stepped = await authSessions.update(session_id, { stepped_up_at: rules.stamp(now) }, tx)
      rules.assertApplied(stepped, 'the step-up stamp')
    })
    return [rules.verificationView(purpose, body.channel, destination, row, status, now), []]
  }

  const cookies = await mintSession(body.channel, destination, body.code)

  if (purpose === 'sign_up' && pending) {
    const created = await users.byPhone(destination)
    if (created) {
      await withTransaction(async (tx) => {
        const named = await users.update(
          created.id,
          { email: pending.email, name: pending.name, emailVerified: true },
          tx
        )
        rules.assertApplied(named, "the new account's own name and email")
        const cleared = await pendingSignups.remove(destination, tx)
        rules.assertApplied(cleared, 'the held sign-up answers')
      })
      await attempt('auth.accountCreated', () =>
        sendAccountCreated({
          order_id: null,
          user_id: created.id,
          email: pending.email,
          name: pending.name,
          url: `${process.env.FRONTEND_URL ?? ''}/`,
        })
      )
    }
  }

  return [rules.verificationView(purpose, body.channel, destination, row, status, Date.now()), cookies]
}

// The code has already been checked against our own throttle; better-auth
// re-reads the same row, mints the session and deletes the code.
async function mintSession(
  channel: OtpChannel,
  destination: string,
  code: string
): Promise<string[]> {
  if (channel === 'sms') {
    const answered = await auth.api.verifyPhoneNumber({
      body: { phoneNumber: destination, code },
      returnHeaders: true,
    })
    return answered.headers.getSetCookie()
  }
  const answered = await auth.api.signInEmailOTP({
    body: { email: destination, otp: code },
    returnHeaders: true,
  })
  return answered.headers.getSetCookie()
}

// ---------------------------------------------------------------- step-up

export async function stepUp(
  user_id: string,
  session_id: string,
  ip: string | null
): Promise<VerificationView> {
  const started = Date.now()
  const user = await users.getOne(user_id)
  rules.assertUser(user)
  rules.assertNotAnonymous(user)
  const session = await authSessions.getOne(session_id)
  rules.assertSession(session)

  const channel = rules.stepUpChannel(user)
  const destination = rules.stepUpDestination(user)
  const kind = rules.kindOf(channel)
  const [row, may] = await reserveSend(
    rules.subjectOf(kind, destination),
    kind,
    ip,
    rules.SENDS_PER_NUMBER,
    rules.NUMBER_WINDOW_SECONDS
  )

  if (may) {
    const code = await mintCode(rules.STEP_UP_OTP_TYPE, destination)
    await attempt('auth.stepUp', () => deliverCode(channel, destination, user, code))
  }
  await padTo(started, rules.SEND_FLOOR_MS)

  const now = Date.now()
  const status: VerificationStatus = rules.isLocked(row, now) ? 'locked' : 'sent'
  return rules.verificationView('step_up', channel, destination, row, status, now)
}

// ----------------------------------------------------------- the factor change

async function requestChange(
  factor: Factor,
  next_value: string,
  user_id: string,
  session_id: string,
  ip: string | null
): Promise<VerificationView> {
  const started = Date.now()
  const user = await users.getOne(user_id)
  rules.assertUser(user)
  rules.assertNotAnonymous(user)
  const session = await authSessions.getOne(session_id)
  rules.assertSession(session)
  rules.assertFactorNotChanged(session)
  rules.assertFresh(session, started)

  if (factor === 'phone') rules.assertUsPhone(next_value)
  rules.assertDifferent(rules.currentValueOf(user, factor), next_value)
  const taken =
    factor === 'email' ? await users.byEmail(next_value) : await users.byPhone(next_value)
  rules.assertAvailable(taken, user.id)
  rules.assertOtherFactorVerified(user, factor)

  const other = rules.otherFactorOf(factor)
  const channel = rules.channelOf(other)
  const carrier = rules.carrierFor(user, factor)
  const kind = rules.kindOf(channel)

  const [row, may] = await reserveSend(
    rules.subjectOf(kind, carrier),
    kind,
    ip,
    rules.SENDS_PER_NUMBER,
    rules.NUMBER_WINDOW_SECONDS
  )

  const abandoned = await pendingChanges.openFor(user.id)
  await withTransaction(async (tx) => {
    if (abandoned) {
      rules.assertApplied(await pendingChanges.removeOpen(user.id, tx), 'the abandoned change')
    }
    await pendingChanges.create(
      {
        user_id: user.id,
        factor,
        next_value,
        verified_via: channel,
        sent_to: carrier,
        expires_at: rules.otpExpiresAt(Date.now()),
      },
      tx
    )
  })

  if (may) {
    const code = await mintCode(rules.CHANGE_OTP_TYPE, carrier)
    await attempt('auth.requestChange', () => deliverCode(channel, carrier, user, code))
  }
  await padTo(started, rules.SEND_FLOOR_MS)

  const now = Date.now()
  const status: VerificationStatus = rules.isLocked(row, now) ? 'locked' : 'sent'
  return rules.verificationView(
    factor === 'email' ? 'change_email' : 'change_phone',
    channel,
    carrier,
    row,
    status,
    now
  )
}

export function changeEmail(
  user_id: string,
  session_id: string,
  email: string,
  ip: string | null
): Promise<VerificationView> {
  return requestChange('email', email.toLowerCase(), user_id, session_id, ip)
}

export function changePhone(
  user_id: string,
  session_id: string,
  phone_number: string,
  ip: string | null
): Promise<VerificationView> {
  return requestChange('phone', phone_number, user_id, session_id, ip)
}

export async function confirmChange(
  user_id: string,
  session_id: string,
  body: ConfirmChangeBody
): Promise<ChangeConfirmedView> {
  const user = await users.getOne(user_id)
  rules.assertUser(user)
  const session = await authSessions.getOne(session_id)
  rules.assertSession(session)
  rules.assertFactorNotChanged(session)

  const pending = await pendingChanges.openFor(user_id)
  rules.assertOpenChange(pending, Date.now())

  const identifier = rules.identifierFor(rules.CHANGE_OTP_TYPE, pending.sent_to)
  const [, status] = await checkCode(
    rules.subjectOf(rules.kindOf(pending.verified_via), pending.sent_to),
    rules.kindOf(pending.verified_via),
    identifier,
    body.code
  )
  rules.assertCodeAccepted(status)

  const previous = rules.currentValueOf(user, pending.factor)
  const now = Date.now()
  await withTransaction(async (tx) => {
    const moved = await users.update(
      user.id,
      rules.confirmedUserPatch(pending.factor, pending.next_value),
      tx
    )
    rules.assertApplied(moved, 'the account')
    const closed = await pendingChanges.update(pending.id, { confirmed_at: rules.stamp(now) }, tx)
    rules.assertApplied(closed, 'the pending change')
    const marked = await authSessions.update(session_id, { factor_changed: pending.factor }, tx)
    rules.assertApplied(marked, 'the one-factor-per-session mark')
    const spent = await verifications.remove(identifier, tx)
    rules.assertApplied(spent, 'the confirmation code')
  })

  // The takeover alarm. It goes to the value that is being replaced, and only
  // after the change is committed.
  const notified = previous
    ? await attempt('auth.notifyPrevious', () =>
        notifyPrevious(user, pending.factor, previous, pending.next_value, now)
      )
    : undefined

  return rules.changeConfirmedView(pending.factor, pending.next_value, notified === true)
}

async function notifyPrevious(
  user: User,
  factor: Factor,
  previous: string,
  next_value: string,
  now: number
): Promise<boolean> {
  const label = rules.detailsChangedLabel(factor)
  if (factor === 'phone') {
    await sms.send(previous, `Your Dorado Metals ${label.toLowerCase()} was changed.`)
    return true
  }
  await sendDetailsChanged({
    order_id: null,
    user_id: user.id,
    email: previous,
    name: user.name,
    changed: label,
    changed_at: rules.changedAtLabel(now),
    rows: detailsChangedRows(label, previous, next_value),
  })
  return true
}

// --------------------------------------------------------------- the session

export async function sessionOf(user_id: string, session_id: string): Promise<SessionView> {
  const user = await users.getOne(user_id)
  rules.assertUser(user)
  const session = await authSessions.getOne(session_id)
  rules.assertSession(session)
  return rules.sessionView(user, session, Date.now())
}

// The recording fakes' last code, for the e2e harness. The route that reads it
// is mounted only while a fake adapter is the one in use.
export function lastCode(number: string | undefined, email: string | undefined): string | null {
  if (number) return fakeSms.lastCodeTo(number)
  if (email) return fakeEmail.lastCodeTo(email)
  return null
}
