import query from '#shared/db/query.ts'
import { isTestRun } from '#shared/testing/is-test-run.ts'
import * as emails from '#db/media/emails/repo.ts'
import type { Email } from '@dorado/contracts'
import type { PoolClient } from 'pg'
import { attempt } from '#shared/attempt.ts'

type Executor = PoolClient | undefined

export type EmailKind = Email['kind']

type EmailBase = {
  kind: EmailKind
  to: string
  subject: string
  order_id?: string | null
  user_id?: string | null
  pdf_id?: string | null
}

export type EmailOutcome =
  | { status: 'sent'; provider_message_id?: string | null }
  | { status: 'failed'; error?: string | null }

export async function recordEmail(
  base: EmailBase,
  outcome: EmailOutcome,
  executor?: Executor
): Promise<void> {
  if (isTestRun() && !executor) return
  await attempt(`record ${outcome.status} ${base.kind} email to ${base.to}`, async () => {
    const orderId = await linkableOrderId(base.order_id, executor)
    await emails.create(
      {
        kind: base.kind,
        status: outcome.status,
        to_address: base.to,
        subject: base.subject,
        order_id: orderId,
        user_id: base.user_id,
        pdf_id: base.pdf_id,
        provider_message_id: outcome.status === 'sent' ? outcome.provider_message_id : null,
        error: outcome.status === 'failed' ? outcome.error : null,
      },
      executor
    )
  })
}

export async function linkableOrderId(
  order_id: string | null | undefined,
  executor?: Executor
): Promise<string | null> {
  if (!order_id) return null
  const { rows } = await query('SELECT 1 FROM orders.orders WHERE id = $1', [order_id], executor)
  return rows.length ? order_id : null
}
