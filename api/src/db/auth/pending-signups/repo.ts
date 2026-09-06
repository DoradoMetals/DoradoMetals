import type { PoolClient } from 'pg'
import query from '#shared/db/query.ts'
import { buildUpdate } from '#shared/db/patch.ts'
import { columnsOf } from '#shared/db/columns.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import { AuthPendingSignup } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export const PATCHABLE = columnsOf(AuthPendingSignup)

export async function getOne(
  id: string,
  executor?: Executor
): Promise<AuthPendingSignup | undefined> {
  const { rows } = await query<AuthPendingSignup>(sql('get_one'), [id], executor)
  return rows[0]
}

export async function byPhone(
  phone_number: string,
  executor?: Executor
): Promise<AuthPendingSignup | undefined> {
  const { rows } = await query<AuthPendingSignup>(sql('by_phone'), [phone_number], executor)
  return rows[0]
}

// A second attempt on the same number reuses the row rather than racing it.
export async function create(
  row: Omit<
    AuthPendingSignup,
    'id' | 'created_at' | 'updated_at' | 'created_by_id' | 'updated_by_id'
  >,
  tx: PoolClient
): Promise<AuthPendingSignup> {
  const { rows } = await query<AuthPendingSignup>(
    sql('create'),
    [row.phone_number, row.email, row.name, row.expires_at],
    tx
  )
  return rows[0]!
}

export async function update(
  id: string,
  patch: Partial<AuthPendingSignup>,
  tx: PoolClient
): Promise<AuthPendingSignup | undefined> {
  const built = buildUpdate({
    table: 'auth.pending_signups',
    allowed: PATCHABLE,
    patch,
    where: { id },
    returning: PATCHABLE.join(', '),
  })
  if (!built) return await getOne(id, tx)
  const { rows } = await query<AuthPendingSignup>(built.text, built.values, tx)
  return rows[0]
}

export async function remove(phone_number: string, tx: PoolClient): Promise<boolean> {
  const result = await query(sql('delete'), [phone_number], tx)
  return (result.rowCount ?? 0) > 0
}
