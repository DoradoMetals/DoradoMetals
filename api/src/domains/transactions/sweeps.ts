import * as orders from '#db/orders/repo.ts'
import { paymentIntents as intents } from '#db'
import * as credit from '#transactions/credit/service.ts'
import withTransaction from '#shared/db/withTransaction.ts'
import * as paymentsService from '#transactions/service.ts'
import { settlementCovers } from '#transactions/rules.ts'
import { attempt } from '#shared/attempt.ts'
import type { Executor } from '#shared/db/executor.ts'
import type { PoolClient } from 'pg'
import type { PaymentIntent } from '@dorado/contracts'

type SettledSweepResult = {
  order_id: NonNullable<PaymentIntent['order_id']>
  outcome: 'advanced' | 'held'
}

export async function sweepSettledIntents(tx: Executor): Promise<SettledSweepResult[]> {
  const candidates = await orders.findSalesAwaitingSettledIntent(tx)
  const out: SettledSweepResult[] = []
  for (const c of candidates) {
    const totals = (await orders.getOne(c.order_id, tx))?.totals
    const intent = await intents.findForOrder(c.order_id, tx)
    if (!settlementCovers(intent?.amount_received, totals?.post_charges_amount)) {
      out.push({ order_id: c.order_id, outcome: 'held' })
      continue
    }
    const advanced = await credit.settleReservation(c.order_id, tx)
    out.push({ order_id: c.order_id, outcome: advanced ? 'advanced' : 'held' })
  }
  return out
}

export const sweepSettledIntentsNow = (): Promise<SettledSweepResult[]> =>
  withTransaction((tx) => sweepSettledIntents(tx))

type AbandonedSweepResult = {
  order_id: NonNullable<PaymentIntent['order_id']>
  refunded: number
}

export async function cancelPendingSale(
  order_id: string,
  client: Executor
): Promise<AbandonedSweepResult> {
  await orders.update(order_id, { cancelled_at: new Date().toISOString() }, {}, client)
  return { order_id, refunded: await credit.releaseReservation(order_id, client) }
}

export async function sweepAbandoned(ttl_hours: number): Promise<AbandonedSweepResult[]> {
  const candidates = await orders.findAbandonedSales(ttl_hours)
  const out: AbandonedSweepResult[] = []

  for (const c of candidates) {
    const result = await attempt(`sweep order ${c.order_id}`, async () => {
      if (c.payment_intent_id) {
        await paymentsService.cancelIntentByRef(c.payment_intent_id)
      }
      return await withTransaction((client: PoolClient) => cancelPendingSale(c.order_id, client))
    })
    if (result) out.push(result)
  }
  return out
}
