import withTransaction from '#shared/db/withTransaction.ts'
import { paymentTransfers as transfers, paymentTransferEvents as events } from '#db'
import {
  assertTransfer,
  assertViewable,
  assertWritten,
  movesForward,
  settledState,
  stateFromMoov,
} from '#transactions/rails/rules.ts'
import type { MoovEvent } from '#providers/payments/moov/types.ts'
import type { Executor } from '#shared/db/executor.ts'
import { reportError } from '#shared/observability/report.ts'
import type { PaymentView, Transfer, TransferState } from '@dorado/contracts'

const MOOV = 'moov'
const STRIPE = 'stripe'

async function attachEvent(
  event_id: string,
  transfer_id: string,
  applied: boolean,
  tx: Executor
): Promise<void> {
  if (await events.attach(event_id, transfer_id, applied, tx)) return
  reportError({
    at: 'rails.attachEvent',
    message: `transfer event ${event_id} was recorded and could not be attached to its transfer`,
    extra: { transfer_id, applied },
  })
}

export async function moveState(
  transfer: Transfer,
  to: TransferState,
  failure_reason: string | null,
  tx: Executor
): Promise<boolean> {
  if (!movesForward(transfer.state, to)) return false
  const stamped = new Date().toISOString()
  const written = await transfers.update(
    transfer.id,
    {
      state: to,
      failure_reason,
      sent_at: to === 'Processing' ? stamped : undefined,
      completed_at: to === settledState(transfer.kind) || to === 'Failed' ? stamped : undefined,
    },
    { state: transfer.state },
    tx
  )
  return written
}

export async function markProcessing(
  transfer: Transfer,
  provider_ref: string,
  tx: Executor
): Promise<void> {
  assertWritten(
    transfer.id,
    await transfers.update(transfer.id, { provider_ref }, { state: 'Processing' }, tx)
  )
}

export async function markFailed(transfer_id: string, reason: string): Promise<void> {
  await withTransaction(async (tx) => {
    const current = assertTransfer(transfer_id, await transfers.getOne(transfer_id, tx))
    await moveState(current, 'Failed', reason, tx)
  })
}

// Every provider event lands here. The event row is written FIRST and is
// unique on (provider, event_id), so a replay writes nothing and applies
// nothing; an event about a transfer we have not heard of is kept unapplied
// rather than dropped; and an event that would move the state backwards is
// kept unapplied too (out-of-order delivery).
export async function applyMoovEvent(event: MoovEvent): Promise<boolean> {
  return await withTransaction(async (tx) => {
    const recorded = await events.record(
      {
        transfer_id: null,
        provider: MOOV,
        event_id: event.eventID,
        event_type: event.type,
        provider_ref: event.transferID,
        reported_state: null,
        failure_reason: event.failureReason,
        occurred_at: event.occurredAt,
      },
      tx
    )
    if (!recorded) return false
    if (!event.transferID) return false

    const transfer = await transfers.findByProviderRef(MOOV, event.transferID, tx)
    if (!transfer) return false

    const to = stateFromMoov(transfer.kind, event.status)
    if (!to) {
      await attachEvent(recorded.id, transfer.id, false, tx)
      return false
    }

    const moved = await moveState(transfer, to, event.failureReason, tx)
    await attachEvent(recorded.id, transfer.id, moved, tx)
    return moved
  })
}

// The card rail keeps the Stripe path and joins the same machine at the end:
// `payment_intent.succeeded` is what makes a card charge Received.
export async function settleCardCharge(
  order_id: string,
  provider_ref: string,
  tx: Executor
): Promise<boolean> {
  const transfer = await transfers.getForOrder(order_id, 'charge', tx)
  if (!transfer) return false
  const recorded = await events.record(
    {
      transfer_id: transfer.id,
      provider: STRIPE,
      event_id: `${provider_ref}:succeeded`,
      event_type: 'payment_intent.succeeded',
      provider_ref,
      reported_state: 'Received',
      failure_reason: null,
      occurred_at: new Date().toISOString(),
    },
    tx
  )
  if (!recorded) return false
  return await moveState(transfer, 'Received', null, tx)
}

export async function getTransfer(id: string): Promise<Transfer> {
  return assertTransfer(id, await transfers.getOne(id))
}

// One SQL read, parsed by its contract (ruling 71). The Payment card renders
// what comes back and computes nothing.
export async function paymentView(order_id: string): Promise<PaymentView> {
  return assertViewable(order_id, await transfers.view(order_id))
}

// A refiner order answers the same shape. Its `amount_due` is the Totals card's
// total, which `refining.order_money` defines once for every read of it.
export async function refiningPaymentView(refining_order_id: string): Promise<PaymentView> {
  return assertViewable(refining_order_id, await transfers.viewRefining(refining_order_id))
}
