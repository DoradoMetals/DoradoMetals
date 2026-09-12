import { Conflict, Forbidden, Invalid, NotFound } from '#shared/errors.ts'
import { maskEmail, maskPhone } from '#shared/text/mask.ts'
import type {
  AuthOtpThrottle,
  AuthPendingChange,
  ChangeConfirmedView,
  Factor,
  OtpChannel,
  OtpPurpose,
  Session,
  SessionView,
  ThrottleKind,
  User,
  Verification,
  VerificationStatus,
  VerificationView,
} from '@dorado/contracts'

export const OTP_LENGTH = 6
export const OTP_EXPIRES_SECONDS = 600
export const RESEND_SECONDS = 30
export const MAX_ATTEMPTS = 5
export const LOCKOUT_SECONDS = 900
export const STEP_UP_FRESH_SECONDS = 300
export const SENDS_PER_NUMBER = 3
export const NUMBER_WINDOW_SECONDS = 900
export const SENDS_PER_IP = 10
export const IP_WINDOW_SECONDS = 3600
export const SEND_FLOOR_MS = 600

export const PLUGIN_ALLOWED_ATTEMPTS = MAX_ATTEMPTS + 5

export const TEMP_EMAIL_DOMAIN = 'phone.dorado.invalid'
export const SIGN_IN_OTP_TYPE = 'sign-in'
export const STEP_UP_OTP_TYPE = 'email-verification'
export const CHANGE_OTP_TYPE = 'change-email'

const US_E164 = /^\+1[2-9]\d{2}[2-9]\d{6}$/

const ms = (value: Date | string | null | undefined): number | null => {
  if (value === null || value === undefined) return null
  const at = value instanceof Date ? value.getTime() : Date.parse(value)
  return Number.isFinite(at) ? at : null
}

const iso = (at: number): string => new Date(at).toISOString()

export const isUsPhone = (value: string): boolean => US_E164.test(value)

export const stamp = (now: number): string => iso(now)

export const otpExpiresAt = (now: number): string => iso(now + OTP_EXPIRES_SECONDS * 1000)

export function assertUsPhone(value: string): void {
  if (!isUsPhone(value)) {
    throw new Invalid('a phone number must be a US number in E.164 form, such as +15125550134')
  }
}

export function assertCaptcha(passed: boolean): void {
  if (!passed) throw new Forbidden('the captcha did not pass')
}

export function assertUser(row: User | undefined): asserts row is User {
  if (!row) throw new NotFound('no such account')
}

export function assertThrottle(row: AuthOtpThrottle | undefined): asserts row is AuthOtpThrottle {
  if (!row) throw new Conflict('the rate-limit row for this identity could not be taken')
}

export function assertApplied(changed: unknown, what: string): void {
  if (!changed) throw new Conflict(`${what} changed nothing`)
}

export function assertNotAnonymous(user: User): void {
  if (user.isAnonymous) throw new Forbidden('an anonymous visitor has no factors to change')
}

export const channelOf = (factor: Factor): OtpChannel => (factor === 'phone' ? 'sms' : 'email')

export const otherFactorOf = (factor: Factor): Factor => (factor === 'phone' ? 'email' : 'phone')

export const kindOf = (channel: OtpChannel): ThrottleKind => (channel === 'sms' ? 'phone' : 'email')

export const subjectOf = (kind: ThrottleKind, value: string): string =>
  `${kind}:${kind === 'email' ? value.toLowerCase() : value}`

export const identifierFor = (type: string, value: string): string =>
  `${type}-otp-${value.toLowerCase()}`

export const temporaryEmailFor = (phone_number: string): string =>
  `${phone_number.replace(/\D/g, '')}@${TEMP_EMAIL_DOMAIN}`

export function destinationOf(
  channel: OtpChannel,
  phone_number: string | null,
  email: string | null
): string {
  if (channel === 'sms') {
    if (!phone_number) throw new Invalid('a phone number is required to send an SMS code')
    assertUsPhone(phone_number)
    return phone_number
  }
  if (!email) throw new Invalid('an email address is required to send an email code')
  return email.toLowerCase()
}

export const maskFor = (channel: OtpChannel, value: string): string =>
  channel === 'sms' ? maskPhone(value) : maskEmail(value)

export function isLocked(row: AuthOtpThrottle, now: number): boolean {
  const until = ms(row.locked_until)
  return until !== null && until > now
}

export function lockedUntil(row: AuthOtpThrottle, now: number): string | null {
  const until = ms(row.locked_until)
  return until !== null && until > now ? iso(until) : null
}

export function attemptsRemaining(row: AuthOtpThrottle, now: number): number {
  if (isLocked(row, now)) return 0
  return Math.max(0, MAX_ATTEMPTS - row.attempts)
}

export function resendAt(row: AuthOtpThrottle, now: number): string {
  const last = ms(row.last_sent_at)
  return iso(last === null ? now : last + RESEND_SECONDS * 1000)
}

export function captchaRequired(row: AuthOtpThrottle | undefined, now: number): boolean {
  const last = row ? ms(row.last_sent_at) : null
  return last === null || last + OTP_EXPIRES_SECONDS * 1000 <= now
}

const windowOpen = (row: AuthOtpThrottle, now: number, windowSeconds: number): boolean => {
  const started = ms(row.window_started_at)
  return started !== null && started + windowSeconds * 1000 > now
}

export function withinSendLimit(
  row: AuthOtpThrottle,
  now: number,
  limit: number,
  windowSeconds: number
): boolean {
  return !windowOpen(row, now, windowSeconds) || row.sends < limit
}

export function nextSend(
  row: AuthOtpThrottle,
  now: number,
  windowSeconds: number
): Partial<AuthOtpThrottle> {
  const open = windowOpen(row, now, windowSeconds)
  return {
    sends: open ? row.sends + 1 : 1,
    window_started_at: open ? (row.window_started_at ?? iso(now)) : iso(now),
    last_sent_at: iso(now),
  }
}

export function nextAttempt(row: AuthOtpThrottle, now: number): Partial<AuthOtpThrottle> {
  const attempts = row.attempts + 1
  return {
    attempts,
    locked_until: attempts >= MAX_ATTEMPTS ? iso(now + LOCKOUT_SECONDS * 1000) : row.locked_until,
  }
}

export function clearedAttempts(): Partial<AuthOtpThrottle> {
  return { attempts: 0, locked_until: null }
}

export function codeMatches(row: Verification | undefined, code: string, now: number): boolean {
  if (!row) return false
  const expires = ms(row.expiresAt)
  if (expires === null || expires <= now) return false
  const cut = row.value.lastIndexOf(':')
  const minted = cut === -1 ? row.value : row.value.slice(0, cut)
  return minted.length > 0 && minted === code
}

export function assertCodeAccepted(status: VerificationStatus): void {
  if (status === 'locked') {
    throw new Forbidden(`too many wrong codes; try again in ${LOCKOUT_SECONDS / 60} minutes`)
  }
  if (status !== 'verified') throw new Invalid('that code is not right')
}

export function sessionFreshUntil(session: Session): number | null {
  const created = ms(session.createdAt)
  const stepped = ms(session.stepped_up_at)
  const at = Math.max(created ?? 0, stepped ?? 0)
  return at === 0 ? null : at + STEP_UP_FRESH_SECONDS * 1000
}

export function isFresh(session: Session, now: number): boolean {
  const until = sessionFreshUntil(session)
  return until !== null && until > now
}

export function assertFresh(session: Session, now: number): void {
  if (!isFresh(session, now)) throw new Forbidden('step_up_required')
}

export function assertFactorNotChanged(session: Session): void {
  if (session.factor_changed) {
    throw new Forbidden('this session already changed a factor; sign in again to change the other')
  }
}

export function assertSession(session: Session | undefined): asserts session is Session {
  if (!session) throw new Forbidden('this session no longer exists')
}

export function assertOtherFactorVerified(user: User, changing: Factor): void {
  if (changing === 'email') {
    if (!user.phone_number || !user.phone_number_verified) {
      throw new Forbidden('add and verify a phone number before changing the email address')
    }
    return
  }
  if (!user.email || !user.emailVerified) {
    throw new Forbidden('verify the email address before changing the phone number')
  }
}

export function assertDifferent(current: string | null, next: string): void {
  if ((current ?? '').toLowerCase() === next.toLowerCase()) {
    throw new Invalid('that is already the value on the account')
  }
}

export function assertAvailable(taken: User | undefined, self_id: string): void {
  if (taken && taken.id !== self_id) throw new Conflict('that value belongs to another account')
}

export function assertOpenChange(
  row: AuthPendingChange | undefined,
  now: number
): asserts row is AuthPendingChange {
  if (!row) throw new NotFound('there is no change waiting to be confirmed')
  const expires = ms(row.expires_at)
  if (expires === null || expires <= now) throw new Invalid('that change has expired; start again')
}

export const currentValueOf = (user: User, factor: Factor): string | null =>
  factor === 'email' ? user.email : user.phone_number

export function carrierFor(user: User, changing: Factor): string {
  const value = changing === 'email' ? user.phone_number : user.email
  if (!value) throw new Forbidden('the other factor is not on this account')
  return value
}

export const changedAtLabel = (now: number): string =>
  `${new Date(now).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })} CT`

export const detailsChangedLabel = (factor: Factor): string =>
  factor === 'email' ? 'Email address' : 'Phone number'

export const stepUpChannel = (user: User): OtpChannel =>
  user.emailVerified ? 'email' : 'sms'

export function stepUpDestination(user: User): string {
  const value = stepUpChannel(user) === 'sms' ? user.phone_number : user.email
  if (!value) throw new Forbidden('this account has no factor to send a code to')
  return value
}

export function verificationView(
  purpose: OtpPurpose,
  channel: OtpChannel,
  destination: string,
  throttle: AuthOtpThrottle,
  status: VerificationStatus,
  now: number
): VerificationView {
  return {
    purpose,
    channel,
    destination: maskFor(channel, destination),
    code_length: OTP_LENGTH,
    expires_at: otpExpiresAt(now),
    resend_at: resendAt(throttle, now),
    attempts_remaining: attemptsRemaining(throttle, now),
    locked_until: lockedUntil(throttle, now),
    status,
  }
}

export function statusAfterCheck(
  throttle: AuthOtpThrottle,
  matched: boolean,
  now: number
): VerificationStatus {
  if (isLocked(throttle, now)) return 'locked'
  return matched ? 'verified' : 'invalid'
}

export function confirmedUserPatch(
  factor: Factor,
  next_value: string
): Partial<Pick<User, 'email' | 'emailVerified' | 'phone_number' | 'phone_number_verified'>> {
  if (factor === 'email') return { email: next_value, emailVerified: true }
  return { phone_number: next_value, phone_number_verified: true }
}

export function changeConfirmedView(
  factor: Factor,
  next_value: string,
  previous_notified: boolean
): ChangeConfirmedView {
  return { factor, next_value, previous_notified }
}

export function sessionView(user: User, session: Session, now: number): SessionView {
  return {
    user_id: user.id,
    email: maskEmail(user.email),
    phone_number: user.phone_number ? maskPhone(user.phone_number) : null,
    phone_number_verified: user.phone_number_verified,
    authenticated_at: iso(ms(session.createdAt) ?? now),
    fresh: isFresh(session, now),
    factor_changed: session.factor_changed,
  }
}

type FreshnessRow = Pick<User, 'banned' | 'role'> & { ban_expires: Date | string | null }

export function sessionVerdict(
  row: FreshnessRow | undefined,
  now: number
): 'revoked' | 'banned' | 'live' {
  if (!row) return 'revoked'
  if (!row.banned) return 'live'
  if (!row.ban_expires) return 'banned'
  return new Date(row.ban_expires).getTime() > now ? 'banned' : 'live'
}

export function sessionRole(row: FreshnessRow | undefined): string | null {
  return row?.role ?? null
}
