import { Conflict, Invalid, NotFound } from '#shared/errors.ts'
import { SmsConsentMethod } from '@dorado/contracts'
import type { User, UserPatch } from '@dorado/contracts'

export function assertUser<T>(row: T | null | undefined, id: string): asserts row is T {
  if (!row) throw new NotFound(`no user ${id}`)
}

export function assertWritten(written: boolean, id: string): void {
  if (!written) throw new NotFound(`no user ${id}`)
}

export function assertBanReasonGiven(patch: UserPatch): void {
  if (patch.banned !== true) return
  const reason = patch.ban_reason?.trim() ?? ''
  if (reason.length < 3) {
    throw new Invalid('banning a customer needs a written ban_reason')
  }
}

export function assertEmailPresent(email: string | null | undefined): asserts email is string {
  if (!email || !email.trim()) {
    throw new Invalid('a new customer needs an email')
  }
}

export function assertEmailAvailable(existing: User | undefined, email: string): void {
  if (existing) throw new Conflict(`a customer already exists with email ${email}`)
}

export function assertPhoneAvailable(existing: User | undefined, phone: string): void {
  if (existing) throw new Conflict(`a customer already exists with phone ${phone}`)
}

export function smsConsentMethodOf(value: string | null | undefined): SmsConsentMethod | null {
  const parsed = SmsConsentMethod.nullable().safeParse(value ?? null)
  return parsed.success ? parsed.data : null
}

export function assertApplied(changed: unknown, what: string): void {
  if (!changed) throw new Conflict(`${what} changed nothing`)
}
