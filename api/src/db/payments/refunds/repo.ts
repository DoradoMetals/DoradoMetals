import query from '#shared/db/query.ts'
import { buildUpdate } from '#shared/db/patch.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import { columnsOf } from '#shared/db/columns.ts'
import { PAYMENT_FACTS } from '#db/orders/repo.ts'
import {
  RefundablePayment as Payable,
  RefundPatch as Patch,
  RefundView as View,
} from '@dorado/contracts'
import type {
  Refund,
  RefundPatch,
  RefundSource,
  RefundablePayment,
  RefundState,
  RefundView,
  RefundWrite,
} from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export const PATCHABLE = columnsOf(Patch)

export async function create(row: RefundWrite, executor?: Executor): Promise<Refund> {
  const { rows } = await query<Refund>(
    sql('create'),
    [row.order_id, row.rail, row.provider, row.payment_ref, row.details_id, row.amount, row.reason],
    executor
  )
  return rows[0]!
}

export async function getOne(id: string, executor?: Executor): Promise<Refund | undefined> {
  const { rows } = await query<Refund>(sql('get_one'), [id], executor)
  return rows[0]
}

export async function listForOrder(order_id: string, executor?: Executor): Promise<RefundView[]> {
  const { rows } = await query(sql('list_for_order'), [order_id], executor)
  return rows.map((row) => View.parse(row))
}

export async function sourceFor(
  order_id: string,
  executor?: Executor
): Promise<RefundSource | undefined> {
  const { rows } = await query<RefundSource>(sql('source_for'), [order_id], executor)
  return rows[0]
}

const PAYMENT_FOR_UPDATE = sql('payment_for_update').replace(
  '/*__order_payment_facts__*/',
  PAYMENT_FACTS
)

export async function paymentForUpdate(
  order_id: string,
  executor: Executor
): Promise<RefundablePayment | undefined> {
  const { rows } = await query(PAYMENT_FOR_UPDATE, [order_id], executor)
  return rows[0] === undefined ? undefined : Payable.parse(rows[0])
}

export async function update(
  id: string,
  patch: RefundPatch,
  state: RefundState,
  executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({
    table: 'payments.refunds',
    allowed: PATCHABLE,
    patch,
    where: { id, state },
  })
  if (!built) return true
  const { rowCount } = await query(built.text, built.values, executor)
  return rowCount === 1
}
