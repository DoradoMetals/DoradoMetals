import type { PoolClient } from 'pg'
import query from '#shared/db/query.ts'
import { buildUpdate } from '#shared/db/patch.ts'
import { columnsOf } from '#shared/db/columns.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import { AuthOtpThrottle } from '@dorado/contracts'
import type { ThrottleKind } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export const PATCHABLE = columnsOf(AuthOtpThrottle)

export async function getOne(
  subject: string,
  executor?: Executor
): Promise<AuthOtpThrottle | undefined> {
  const { rows } = await query<AuthOtpThrottle>(sql('get_one'), [subject], executor)
  return rows[0]
}

// The row the send limits and the lockout are decided on. FOR UPDATE, so two
// requests for one number queue instead of both reading the same count.
export async function lock(subject: string, tx: PoolClient): Promise<AuthOtpThrottle | undefined> {
  const { rows } = await query<AuthOtpThrottle>(sql('lock'), [subject], tx)
  return rows[0]
}

// Upsert: the conflicting update is what takes the row lock when it exists.
export async function create(
  subject: string,
  kind: ThrottleKind,
  tx: PoolClient
): Promise<AuthOtpThrottle> {
  const { rows } = await query<AuthOtpThrottle>(sql('create'), [subject, kind], tx)
  return rows[0]!
}

export async function update(
  subject: string,
  patch: Partial<AuthOtpThrottle>,
  tx: PoolClient
): Promise<AuthOtpThrottle | undefined> {
  const built = buildUpdate({
    table: 'auth.otp_throttles',
    allowed: PATCHABLE,
    patch,
    where: { subject },
    returning: PATCHABLE.join(', '),
  })
  if (!built) return await getOne(subject, tx)
  const { rows } = await query<AuthOtpThrottle>(built.text, built.values, tx)
  return rows[0]
}

export async function remove(subject: string, tx: PoolClient): Promise<boolean> {
  const result = await query(sql('delete'), [subject], tx)
  return (result.rowCount ?? 0) > 0
}
