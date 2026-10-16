import * as refunds from '#db/payments/refunds/repo.ts'
import * as ordersRepo from '#db/orders/repo.ts'
import * as ledger from '#transactions/ledger/service.ts'
import * as stepUp from '#accounts/auth/step-up.ts'
import * as stripe from '#providers/stripe/stripe.ts'
import * as rules from '#transactions/refunds/rules.ts'
import withTransaction from '#shared/db/withTransaction.ts'
import { attempt } from '#shared/attempt.ts'
import type { RefundIssuer } from '#providers/stripe/stripe.ts'
import type { Refund, RefundBody, RefundView } from '@dorado/contracts'

const STRIPE = 'stripe'

export async function listForOrder(order_id: string): Promise<RefundView[]> {
  rules.assertOrder(await ordersRepo.exists(order_id), order_id)
  return await refunds.listForOrder(order_id)
}

export async function refund(
  order_id: string,
  body: RefundBody,
  session_id: string | null,
  issue: RefundIssuer = stripe.createRefund
): Promise<RefundView[]> {
  rules.assertOrder(await ordersRepo.exists(order_id), order_id)
  await stepUp.assertSteppedUp(session_id)
  const source = await refunds.sourceFor(order_id)
  rules.assertCardSource(source, order_id)

  const pending = await withTransaction(async (tx) => {
    const payment = await refunds.paymentForUpdate(order_id, tx)
    rules.assertRefundable(body.amount, payment, order_id)
    return await refunds.create(
      {
        order_id,
        rail: 'CARD',
        provider: STRIPE,
        payment_ref: source.payment_ref,
        details_id: source.details_id,
        amount: body.amount,
        reason: body.reason,
      },
      tx
    )
  })

  await issueRefund(pending, issue)
  return await refunds.listForOrder(order_id)
}

export async function resume(
  order_id: string,
  refund_id: string,
  session_id: string | null,
  issue: RefundIssuer = stripe.createRefund
): Promise<RefundView[]> {
  const pending = await refunds.getOne(refund_id)
  rules.assertRefund(pending, refund_id, order_id)
  rules.assertRefundOfOrder(pending, order_id)
  rules.assertPending(pending)
  await stepUp.assertSteppedUp(session_id)
  await issueRefund(pending, issue)
  return await refunds.listForOrder(order_id)
}

async function issueRefund(pending: Refund, issue: RefundIssuer): Promise<void> {
  const outcome = await attempt(`stripe refund ${pending.id}`, () =>
    issue({
      paymentIntentId: pending.payment_ref as string,
      amountCents: rules.refundCents(pending.amount),
      idempotencyKey: rules.refundKeyFor(pending.id),
      metadata: { refund_id: pending.id, order_id: pending.order_id },
    })
  )
  if (!outcome) return

  const patch = rules.settledBy(outcome, new Date().toISOString())
  if (!patch) return
  await withTransaction(async (tx) => {
    const moved = await refunds.update(pending.id, patch, 'Pending', tx)
    if (!moved || !rules.ledgersRefund(patch)) return
    const owner = await ordersRepo.ownerOf(pending.order_id, tx)
    if (!owner) return
    await ledger.addTransactionLog(
      { user_id: owner, type: 'Refund', order_id: pending.order_id, amount: pending.amount },
      tx
    )
  })
}
