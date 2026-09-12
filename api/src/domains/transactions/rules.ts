import { Forbidden, Invalid, NotFound } from '#shared/errors.ts'
import type { PaymentDetailsWrite, PaymentSurface } from '@dorado/contracts'
import type { StripePaymentMethodLike } from '#providers/stripe/stripe.ts'

export function toDollars(cents: number | null | undefined): number | null {
  return cents == null ? null : cents / 100
}

export function intentOwner(
  type: string | undefined | null,
  session_user_id: string,
  named_user_id: string | null | undefined
): string | null {
  return type === 'admin' ? (named_user_id ?? null) : session_user_id
}

const OPEN = new Set(['requires_payment_method', 'requires_confirmation', 'requires_action'])

export function isOpen(status: string | null | undefined): boolean {
  return OPEN.has(status ?? '')
}

const RESOLVED = new Set(['canceled', 'succeeded', 'processing'])

export function isResolved(status: string | null | undefined): boolean {
  return RESOLVED.has(status ?? '')
}

export function isSettled(status: string | null | undefined): boolean {
  return status === 'succeeded' || status === 'processing'
}

export function methodTypeFor(stripe_type: string | null | undefined): string | null {
  if (!stripe_type) return null
  if (stripe_type === 'us_bank_account') return 'ACH'
  if (stripe_type === 'card') return 'CARD'
  return stripe_type.toUpperCase()
}

export function instrumentValues(
  paymentMethod: StripePaymentMethodLike | null | undefined,
  method_id: string | null
): PaymentDetailsWrite {
  const bank = paymentMethod?.us_bank_account
  const card = paymentMethod?.card
  return {
    method_id,
    bank_name: bank?.bank_name ?? null,
    account_type: bank?.account_type ?? null,
    last_four: bank?.last4 ?? card?.last4 ?? null,
    card_brand: card?.brand ?? null,
    provider: 'stripe',
    provider_ref: paymentMethod?.id ?? null,
  }
}

const STRIPE_MINIMUM_CENTS = 50

export function chargeCents(dollars: number): number {
  return Math.round(dollars * 100)
}

export function isChargeable(cents: number): boolean {
  return cents >= STRIPE_MINIMUM_CENTS
}

export function paymentSurface(post_charges_amount: number): PaymentSurface {
  return isChargeable(chargeCents(post_charges_amount)) ? 'card' : 'credit'
}

export function idempotencyKeyFor(
  type: string,
  user_id: string,
  session_id: string,
  attempt: number
): string {
  return `intent:${type}:${user_id}:${session_id}:${attempt}`
}

export function assertBillingIdentity<T extends { id?: string | null }>(
  identity: T | null | undefined,
  type: string | undefined
): T {
  if (identity?.id) return identity
  if (type === 'admin') {
    throw new Invalid('an admin payment intent must name a customer that exists')
  }
  throw new Forbidden('no user row for this session')
}

export function assertIntentSubject(subject: string | undefined): string {
  if (!subject) throw new Invalid('an admin payment intent must name the customer it is for')
  return subject
}

export function assertPriceableBalance(
  subject: string,
  balance: number | null | undefined
): number {
  if (balance === undefined) throw new NotFound(`no user ${subject} to price this intent for`)
  return Number(balance ?? 0)
}

const HALF_CENT = 0.005

export function settlementCovers(
  amount_received: number | string | null | undefined,
  post_charges_amount: number | string | null | undefined
): boolean {
  const expected = Number(post_charges_amount ?? 0)
  if (!(expected > 0)) return true
  return Number(amount_received ?? 0) + HALF_CENT >= expected
}

export function assertWebhookMatched(provider_ref: string, matched: boolean): void {
  if (!matched) {
    throw new Error(
      `stripe webhook: no payment intent row for ${provider_ref} - refusing so Stripe retries`
    )
  }
}
