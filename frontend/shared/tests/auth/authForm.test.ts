import { describe, expect, test } from 'vitest'
import type { VerificationView } from '@dorado/contracts'

import {
  codeStateFor,
  isStepUpRequired,
  messageOf,
  minutesUntil,
  secondsUntil,
} from '@/shared/utils/authForm'

const NOW = Date.parse('2026-09-06T12:00:00.000Z')

const view = (over: Partial<VerificationView> = {}): VerificationView => ({
  purpose: 'sign_in',
  channel: 'sms',
  destination: '(•••) •••-0134',
  code_length: 6,
  expires_at: new Date(NOW + 600_000).toISOString(),
  resend_at: new Date(NOW + 24_000).toISOString(),
  attempts_remaining: 4,
  locked_until: null,
  status: 'sent',
  ...over,
})

// The state the code screen wears is the API's answer, never a decision here.
describe('codeStateFor', () => {
  test('a sent code is the plain OTP screen', () => {
    expect(codeStateFor(view())).toBe('otp')
  })

  test('a step-up is the same screen with different words', () => {
    expect(codeStateFor(view({ purpose: 'step_up' }))).toBe('verify-its-you')
  })

  test('an invalid code is the error face, whatever the purpose', () => {
    expect(codeStateFor(view({ status: 'invalid' }))).toBe('otp-error')
    expect(codeStateFor(view({ purpose: 'step_up', status: 'invalid' }))).toBe('otp-error')
  })

  test('a verified code is the success face', () => {
    expect(codeStateFor(view({ status: 'verified' }))).toBe('otp-success')
  })

  test('locked outranks every other face', () => {
    expect(codeStateFor(view({ status: 'locked', locked_until: 'x' }))).toBe('locked')
  })
})

describe('countdowns', () => {
  test('seconds until the resend opens', () => {
    expect(secondsUntil(new Date(NOW + 24_000).toISOString(), NOW)).toBe(24)
  })

  test('a past instant is zero, never negative', () => {
    expect(secondsUntil(new Date(NOW - 5_000).toISOString(), NOW)).toBe(0)
    expect(secondsUntil(null, NOW)).toBe(0)
  })

  test('the lockout is reported in whole minutes, rounded up', () => {
    expect(minutesUntil(new Date(NOW + 900_000).toISOString(), NOW)).toBe(15)
    expect(minutesUntil(new Date(NOW + 61_000).toISOString(), NOW)).toBe(2)
    expect(minutesUntil(null, NOW)).toBe(0)
  })
})

describe('the API keeps the words', () => {
  test('a refusal is shown in the API’s own message', () => {
    expect(messageOf(new Error('that is already the value on the account'))).toBe(
      'that is already the value on the account'
    )
    expect(messageOf(null)).toBeNull()
  })

  test('step_up_required is recognised as a route, not a message', () => {
    expect(isStepUpRequired(new Error('step_up_required'))).toBe(true)
    expect(isStepUpRequired(new Error('the captcha did not pass'))).toBe(false)
  })
})
