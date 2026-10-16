import { Conflict, Invalid, NotFound } from '#shared/errors.ts'
import type { RefundOutcome } from '#providers/stripe/stripe.ts'
import type { Refund, RefundPatch, RefundSource, RefundablePayment } from '@dorado/contracts'

export function assertOrder<T>(row: T | null | undefined, order_id: string): asserts row is T {
  if (!row) throw new NotFound(`no order ${order_id}`)
}

export function assertRefund<T>(
  row: T | null | undefined,
  refund_id: string,
  order_id: string
): asserts row is T {
  if (!row) throw new NotFound(`order ${order_id} has no refund ${refund_id}`)
}

export function assertRefundOfOrder(refund: Refund, order_id: string): void {
  if (refund.order_id !== order_id) {
    throw new NotFound(`order ${order_id} has no refund ${refund.id}`)
  }
}

export function assertPending(refund: Refund): void {
  if (refund.state !== 'Pending') {
    throw new Conflict(`refund ${refund.id} is ${refund.state}, so there is nothing to issue`)
  }
}

export function assertCardSource(
  source: RefundSource | undefined,
  order_id: string
): asserts source is RefundSource & { payment_ref: string } {
  if (!source?.payment_ref) {
    throw new Invalid(
      `order ${order_id} has no succeeded card payment - refunds are card refunds ` +
        `through Stripe for now (ruling 149)`
    )
  }
}

export function assertRefundable(
  amount: number,
  payment: RefundablePayment | undefined,
  order_id: string
): asserts payment is RefundablePayment {
  if (!payment) throw new NotFound(`no order ${order_id}`)
  if (amount > payment.payment.refundable) {
    throw new Conflict(
      `order ${order_id} has ${payment.payment.refundable.toFixed(2)} left to refund to the ` +
        `card, so a refund of ${amount.toFixed(2)} is refused`
    )
  }
}

export function refundCents(amount: number): number {
  return Math.round(amount * 100)
}

export function refundKeyFor(refund_id: string): string {
  return `refund_${refund_id}`
}

export function settledBy(outcome: RefundOutcome, now: string): RefundPatch | null {
  if (outcome.status === 'succeeded') {
    return { state: 'Succeeded', provider_ref: outcome.provider_ref, refunded_at: now }
  }
  if (outcome.status === 'failed' || outcome.status === 'canceled') {
    return {
      state: 'Failed',
      provider_ref: outcome.provider_ref,
      failure_reason: outcome.failure_reason ?? `the provider answered ${outcome.status}`,
    }
  }
  return outcome.provider_ref ? { provider_ref: outcome.provider_ref } : null
}

export function ledgersRefund(patch: RefundPatch | null): boolean {
  return patch?.state === 'Succeeded'
}
