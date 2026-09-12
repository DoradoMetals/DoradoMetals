import type { PoolClient } from 'pg'
import query from '#shared/db/query.ts'
import { buildUpdate } from '#shared/db/patch.ts'
import { columnsOf } from '#shared/db/columns.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import { AuthPendingChange } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export const PATCHABLE = columnsOf(AuthPendingChange)

export async function getOne(
  id: string,
  executor?: Executor
): Promise<AuthPendingChange | undefined> {
  const { rows } = await query<AuthPendingChange>(sql('get_one'), [id], executor)
  return rows[0]
}

export async function openFor(
  user_id: string,
  executor?: Executor
): Promise<AuthPendingChange | undefined> {
  const { rows } = await query<AuthPendingChange>(sql('open_for'), [user_id], executor)
  return rows[0]
}

export async function create(
  row: Omit<
    AuthPendingChange,
    'id' | 'confirmed_at' | 'created_at' | 'updated_at' | 'created_by_id' | 'updated_by_id'
  >,
  tx: PoolClient
): Promise<AuthPendingChange> {
  const { rows } = await query<AuthPendingChange>(
    sql('create'),
    [row.user_id, row.factor, row.next_value, row.verified_via, row.sent_to, row.expires_at],
    tx
  )
  return rows[0]!
}

export async function update(
  id: string,
  patch: Partial<AuthPendingChange>,
  tx: PoolClient
): Promise<AuthPendingChange | undefined> {
  const built = buildUpdate({
    table: 'auth.pending_changes',
    allowed: PATCHABLE,
    patch,
    where: { id },
    returning: PATCHABLE.join(', '),
  })
  if (!built) return await getOne(id, tx)
  const { rows } = await query<AuthPendingChange>(built.text, built.values, tx)
  return rows[0]
}

export async function removeOpen(user_id: string, tx: PoolClient): Promise<boolean> {
  const result = await query(sql('delete_open'), [user_id], tx)
  return (result.rowCount ?? 0) > 0
}
