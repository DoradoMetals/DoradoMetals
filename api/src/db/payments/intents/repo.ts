import query from '#shared/db/query.ts'
import { buildUpdate } from '#shared/db/patch.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import type { PaymentIntent, PaymentIntentView, PaymentIntentFacts } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'
import { columnsOf } from '#shared/db/columns.ts'
import { PaymentIntentPatch } from '@dorado/contracts'

const sql = sqlFrom(import.meta.dirname)

export const PATCHABLE = columnsOf(
  PaymentIntentPatch.omit({ session_id: true, user_id: true, type: true })
)

export async function getOne(id: string, executor?: Executor): Promise<PaymentIntent | undefined> {
  const { rows } = await query<PaymentIntent>(sql('get_one'), [id], executor)
  return rows[0]
}

export async function create(
  row: PaymentIntentPatch & Pick<PaymentIntent, 'type'>,
  executor?: Executor
): Promise<PaymentIntent> {
  const { rows } = await query<PaymentIntent>(
    sql('create'),
    [
      row.session_id ?? null,
      row.user_id ?? null,
      row.type,
      row.status ?? null,
      row.amount_expected ?? null,
      row.order_id ?? null,
      row.details_id ?? null,
      row.method_id ?? null,
    ],
    executor
  )
  return rows[0]
}

export async function update(
  id: string,
  patch: PaymentIntentPatch,
  executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({
    table: 'payments.intents',
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

export async function findReusable(
  session_id: string,
  user_id: string | null,
  type: string | null,
  executor?: Executor
): Promise<PaymentIntentView | undefined> {
  const { rows } = await query<PaymentIntentView>(
    sql('find_reusable'),
    [session_id, user_id, type],
    executor
  )
  return rows[0]
}

export async function countFor(
  session_id: string,
  user_id: string | null,
  type: string,
  executor?: Executor
): Promise<number> {
  const { rows } = await query<{ n: number }>(
    sql('count_for'),
    [session_id, user_id, type],
    executor
  )
  return rows[0]?.n ?? 0
}

export async function findForOrder(
  order_id: string,
  executor?: Executor
): Promise<PaymentIntentView | undefined> {
  const { rows } = await query<PaymentIntentView>(sql('find_for_order'), [order_id], executor)
  return rows[0]
}

export async function findOpenForUser(
  user_id: string,
  executor?: Executor
): Promise<PaymentIntentFacts | undefined> {
  const { rows } = await query<PaymentIntentFacts>(sql('find_open_for_user'), [user_id], executor)
  return rows[0]
}

export async function findFactsByRef(
  provider_ref: string,
  executor?: Executor
): Promise<PaymentIntentFacts | undefined> {
  const { rows } = await query<PaymentIntentFacts>(
    sql('find_facts_by_ref'),
    [provider_ref],
    executor
  )
  return rows[0]
}
