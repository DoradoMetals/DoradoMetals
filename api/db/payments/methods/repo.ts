import query from '#shared/db/query.ts'
import { buildUpdate } from '#shared/db/patch.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import type { Executor } from '#shared/db/executor.ts'
import { columnsOf } from '#shared/db/columns.ts'
import { PaymentMethod, PaymentMethodPatch } from '@dorado/contracts'

const sql = sqlFrom(import.meta.dirname)

export const PATCHABLE = columnsOf(PaymentMethodPatch)

export async function getOne(id: string, executor?: Executor): Promise<PaymentMethod | undefined> {
  const { rows } = await query<PaymentMethod>(sql('get_one'), [id], executor)
  return rows[0]
}

export async function list(executor?: Executor): Promise<PaymentMethod[]> {
  const { rows } = await query<PaymentMethod>(sql('list'), [], executor)
  return rows
}

export async function listFor(direction: string, executor?: Executor): Promise<PaymentMethod[]> {
  const { rows } = await query<PaymentMethod>(sql('list_for_direction'), [direction], executor)
  return rows
}

export async function findByType(
  direction: string,
  type: string,
  executor?: Executor
): Promise<PaymentMethod | undefined> {
  const { rows } = await query<PaymentMethod>(sql('find_by_type'), [direction, type], executor)
  return rows[0]
}

export async function update(
  id: string,
  patch: PaymentMethodPatch,
  executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({
    table: 'payments.methods',
    allowed: PATCHABLE,
    patch,
    where: { id },
  })
  if (!built) return true
  const { rowCount } = await query(built.text, built.values, executor)
  return rowCount === 1
}
