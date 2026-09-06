import {
  orders as ordersRepo,
  paymentDetails as details,
  paymentMethods as methods,
  paymentIntents as intents,
  emails,
} from '#db'
import * as stripe from '#providers/payment/stripe.ts'
import {
  assertWebhookMatched,
  instrumentValues,
  methodTypeFor,
  settlementCovers,
  toDollars,
} from '#transactions/rules.ts'
import { findIntentByRef, updateFromProvider } from '#transactions/service.ts'
import * as emailService from '#documents/emails/service.ts'
import withTransaction from '#shared/db/withTransaction.ts'
import { reportError } from '#shared/observability/report.ts'
import type { Executor } from '#shared/db/executor.ts'
import type {
  StripeIntentLike,
  StripePaymentMethodLike,
  Instruments,
} from '#providers/payment/stripe.ts'

export const LIVE: Instruments & { confirm: (order_id: string) => Promise<void> } = {
  retrieve: stripe.retrievePaymentMethod,
  confirm: (order_id: string) => emailService.sendOrderPlacedConfirmation(order_id),
}

const PLACED = ['purchase_order_created'] as const

export async function applyIntentEvent(
  paymentIntent: StripeIntentLike,
  payment_method_ref?: unknown,
  world: typeof LIVE = LIVE
): Promise<void> {
  const prior = await findIntentByRef(paymentIntent.id)
  assertWebhookMatched(
    paymentIntent.id,
    await withTransaction((tx) => updateFromProvider(paymentIntent, tx))
  )

  const order_id = prior?.direction === 'sale' ? prior.order_id : null
  if (paymentIntent.status === 'succeeded' && order_id) {
    const owed = (await ordersRepo.getOne(order_id))?.totals?.post_charges_amount
    if (settlementCovers(toDollars(paymentIntent.amount_received), owed)) {
      await withTransaction((tx) =>
        ordersRepo.update(order_id, { status: 'Preparing' }, { status: 'Pending' }, tx)
      )
      if (!(await emails.hasSent(order_id, PLACED))) await world.confirm(order_id)
    } else {
      reportError({
        at: 'stripe.webhook',
        message:
          `stripe settled ${toDollars(paymentIntent.amount_received)} against an order ` +
          `owed ${owed} - the order was NOT advanced`,
        extra: { order_id, provider_ref: paymentIntent.id },
      })
    }
  }

  if (typeof payment_method_ref !== 'string') return
  await recordInstrument(
    await world.retrieve(payment_method_ref),
    prior?.user_id ?? null,
    prior?.intent_id ?? null
  )
}

export async function applyMethodEvent(
  paymentMethod: StripePaymentMethodLike | null | undefined
): Promise<void> {
  await recordInstrument(paymentMethod, null, null)
}

async function linkInstrument(
  intent_id: string | null,
  details_id: string,
  method_id: string | null,
  tx: Executor
): Promise<void> {
  if (!intent_id) return
  await intents.update(intent_id, { details_id, method_id }, tx)
}

async function recordInstrument(
  paymentMethod: StripePaymentMethodLike | null | undefined,
  user_id: string | null,
  intent_id: string | null
): Promise<void> {
  const type = methodTypeFor(paymentMethod?.type)
  const method = type ? await methods.findByType('sale', type) : undefined
  const values = instrumentValues(paymentMethod, method?.id ?? null)
  if (!values.provider_ref) return

  const existing = await details.findByProviderRef('stripe', values.provider_ref)
  if (existing) {
    await withTransaction(async (tx) => {
      await details.update(existing.id, values, tx)
      await linkInstrument(intent_id, existing.id, values.method_id ?? null, tx)
    })
    return
  }
  if (!user_id) return
  await withTransaction(async (tx) => {
    const created = await details.create(user_id, values, tx)
    await linkInstrument(intent_id, created.id, values.method_id ?? null, tx)
  })
}
