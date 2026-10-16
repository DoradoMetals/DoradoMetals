import { requiredEnv } from '#shared/env/required.ts'
import stripeClient from '#providers/stripe/stripe-client.ts'
import type Stripe from 'stripe'

export type StripeIntentLike = {
  id: string
  status?: string | null
  amount?: number | null
  amount_received?: number | null
  client_secret?: string | null
}

export type StripePaymentMethodLike = {
  id?: string
  type?: string
  card?: { last4?: string | null; brand?: string | null } | null
  us_bank_account?: {
    bank_name?: string | null
    account_type?: string | null
    last4?: string | null
  } | null
}

export type Instruments = {
  retrieve: (payment_method_ref: string) => Promise<StripePaymentMethodLike>
}

export function retrieveIntent(paymentIntentId: string) {
  return stripeClient.paymentIntents.retrieve(paymentIntentId)
}

export function createIntent({
  amount,
  currency = 'usd',
  customerId,
  metadata,
  idempotencyKey,
}: {
  amount: number
  currency?: string
  customerId?: string
  metadata?: Record<string, string>
  idempotencyKey?: string
}) {
  return stripeClient.paymentIntents.create(
    {
      amount,
      currency,
      customer: customerId,
      capture_method: 'automatic',
      automatic_payment_methods: { enabled: true },
      metadata,
    },
    idempotencyKey ? { idempotencyKey } : undefined
  )
}

export function updateIntent(paymentIntentId: string, changes: Record<string, unknown>) {
  return stripeClient.paymentIntents.update(paymentIntentId, changes)
}

export async function cancelIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
  try {
    return await stripeClient.paymentIntents.cancel(paymentIntentId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (/No such payment_intent|already.*cancel/i.test(msg)) {
      return { id: paymentIntentId, status: 'canceled' } as Stripe.PaymentIntent
    }
    throw err
  }
}

export type RefundRequest = {
  paymentIntentId: string
  amountCents: number
  idempotencyKey: string
  metadata: Record<string, string>
}

export type RefundOutcome = {
  provider_ref: string | null
  status: string
  failure_reason: string | null
}

export type RefundIssuer = (request: RefundRequest) => Promise<RefundOutcome>

const NOTHING_MOVED = new Set(['StripeInvalidRequestError', 'StripeCardError'])

async function refundAlreadyIssued(request: RefundRequest): Promise<Stripe.Refund | null> {
  for await (const refund of stripeClient.refunds.list({
    payment_intent: request.paymentIntentId,
    limit: 100,
  })) {
    if (refund.metadata?.refund_id === request.metadata.refund_id) return refund
  }
  return null
}

export async function createRefund(request: RefundRequest): Promise<RefundOutcome> {
  try {
    const refund =
      (await refundAlreadyIssued(request)) ??
      (await stripeClient.refunds.create(
        {
          payment_intent: request.paymentIntentId,
          amount: request.amountCents,
          metadata: request.metadata,
        },
        { idempotencyKey: request.idempotencyKey }
      ))
    return {
      provider_ref: refund.id,
      status: refund.status ?? 'pending',
      failure_reason: refund.failure_reason ?? null,
    }
  } catch (err) {
    const type = (err as { type?: string }).type ?? ''
    if (!NOTHING_MOVED.has(type)) throw err
    return {
      provider_ref: null,
      status: 'failed',
      failure_reason: err instanceof Error ? err.message : type,
    }
  }
}

export function createCustomer({ name, email }: { name?: string | null; email?: string | null }) {
  return stripeClient.customers.create({ name: name ?? '', email: email ?? '' })
}

export function retrievePaymentMethod(paymentMethodId: string) {
  return stripeClient.paymentMethods.retrieve(paymentMethodId)
}

export function verifyWebhook(rawBody: Buffer | string, signature: string) {
  return stripeClient.webhooks.constructEvent(
    rawBody,
    signature,
    requiredEnv('STRIPE_WEBHOOK_SECRET')
  )
}
