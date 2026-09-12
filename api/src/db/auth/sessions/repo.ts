import type { PoolClient } from 'pg'
import query from '#shared/db/query.ts'
import { buildUpdate } from '#shared/db/patch.ts'
import { columnsOf } from '#shared/db/columns.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import { Session } from '@dorado/contracts'
import type { User } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

const RETURNING =
  'id, "userId", token, "expiresAt", "createdAt", "updatedAt", "ipAddress", ' +
  '"userAgent", "impersonatedBy", factor_changed, stepped_up_at'

export const PATCHABLE = columnsOf(Session)

type Freshness = Pick<User, 'banned' | 'role'> & { ban_expires: Date | string | null }

export async function freshnessOf(
  session_id: string,
  executor?: Executor
): Promise<Freshness | undefined> {
  const { rows } = await query<Freshness>(sql('freshness'), [session_id], executor)
  return rows[0]
}

export async function getOne(id: string, executor?: Executor): Promise<Session | undefined> {
  const { rows } = await query<Session>(sql('get_one'), [id], executor)
  return rows[0]
}

export async function update(
  id: string,
  patch: Partial<Pick<Session, 'factor_changed' | 'stepped_up_at'>>,
  tx: PoolClient
): Promise<Session | undefined> {
  const built = buildUpdate({
    table: 'auth.sessions',
    allowed: PATCHABLE,
    patch,
    where: { id },
    returning: RETURNING,
  })
  if (!built) return await getOne(id, tx)
  const { rows } = await query<Session>(built.text, built.values, tx)
  return rows[0]
}
