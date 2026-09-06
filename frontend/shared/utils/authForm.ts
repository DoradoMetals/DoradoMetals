import type { VerificationView } from '@dorado/contracts'

export type AuthFormState =
  | 'sign-in'
  | 'sign-in-email'
  | 'sign-up'
  | 'otp'
  | 'otp-error'
  | 'otp-success'
  | 'verify-its-you'
  | 'change-email'
  | 'change-phone'
  | 'locked'
  | 'confirmed'
  | 'session-expired'

export type CodeFormState = 'otp' | 'otp-error' | 'otp-success' | 'verify-its-you' | 'locked'

// One code screen, three jobs. Which of the faces it wears is the API's own
// `status` and `purpose`; nothing here decides it.
export function codeStateFor(view: VerificationView): CodeFormState {
  if (view.status === 'locked') return 'locked'
  if (view.status === 'verified') return 'otp-success'
  if (view.status === 'invalid') return 'otp-error'
  return view.purpose === 'step_up' ? 'verify-its-you' : 'otp'
}

export const secondsUntil = (at: string | null, now: number = Date.now()): number => {
  if (!at) return 0
  const ms = Date.parse(at) - now
  return ms <= 0 ? 0 : Math.ceil(ms / 1000)
}

export const minutesUntil = (at: string | null, now: number = Date.now()): number =>
  Math.ceil(secondsUntil(at, now) / 60)

// The API's own words. A failed send or verify answers a message; the form
// shows it rather than inventing one.
export function messageOf(error: unknown): string | null {
  if (!error) return null
  return error instanceof Error ? error.message : String(error)
}

export const isStepUpRequired = (error: unknown): boolean =>
  error instanceof Error && error.message.includes('step_up_required')
