import { requiredEnv } from '#shared/env/required.ts'
import stripeClient from '#providers/payment/stripe-client.ts'
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
