import query from '#shared/db/query.ts'
import { buildUpdate } from '#shared/db/patch.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import type { PaymentAttempt } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'
import { columnsOf } from '#shared/db/columns.ts'
import { PaymentAttemptPatch } from '@dorado/contracts'

const sql = sqlFrom(import.meta.dirname)

export const PATCHABLE = columnsOf(PaymentAttemptPatch.omit({ id: true, intent_id: true }))

export async function getOne(id: string, executor?: Executor): Promise<PaymentAttempt | undefined> {
  const { rows } = await query<PaymentAttempt>(sql('get_one'), [id], executor)
  return rows[0]
}

export async function listFor(intent_id: string, executor?: Executor): Promise<PaymentAttempt[]> {
  const { rows } = await query<PaymentAttempt>(sql('list_for_intent'), [intent_id], executor)
  return rows
}

export async function findByProviderRef(
  provider_ref: string,
  executor?: Executor
): Promise<PaymentAttempt | undefined> {
  const { rows } = await query<PaymentAttempt>(
    sql('find_by_provider_ref'),
    [provider_ref],
    executor
  )
  return rows[0]
}

export async function create(
  row: PaymentAttemptPatch,
  executor?: Executor
): Promise<PaymentAttempt> {
  const { rows } = await query<PaymentAttempt>(
    sql('create'),
    [
      row.id ?? null,
      row.intent_id,
      row.method_id ?? null,
      row.provider ?? null,
      row.provider_ref,
      row.amount ?? null,
      row.status ?? null,
    ],
    executor
  )
  return rows[0]
}

export async function update(
  id: string,
  patch: PaymentAttemptPatch,
  executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({
    table: 'payments.attempts',
    allowed: PATCHABLE,
    patch,
    where: { id },
  })
  if (!built) return true
  const { rowCount } = await query(built.text, built.values, executor)
  return rowCount === 1
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql('delete'), [id], executor)
  return rowCount === 1
}
