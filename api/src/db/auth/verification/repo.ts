import type { PoolClient } from 'pg'
import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import type { Verification } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

// better-auth mints every code and writes it here (ruling 92). It is read back
// only to be compared; the attempts counter and the lockout are ours, in
// auth.otp_throttles, so one place answers both.
export async function byIdentifier(
  identifier: string,
  executor?: Executor
): Promise<Verification | undefined> {
  const { rows } = await query<Verification>(sql('by_identifier'), [identifier], executor)
  return rows[0]
}

export async function remove(identifier: string, tx: PoolClient): Promise<boolean> {
  const result = await query(sql('delete'), [identifier], tx)
  return (result.rowCount ?? 0) > 0
}
