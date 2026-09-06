import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import type { User } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

type Freshness = Pick<User, 'banned' | 'role'> & { ban_expires: Date | string | null }

// No row means the session no longer exists - revoked, or expired and swept.
export async function freshnessOf(
  session_id: string,
  executor?: Executor
): Promise<Freshness | undefined> {
  const { rows } = await query<Freshness>(sql('freshness'), [session_id], executor)
  return rows[0]
}
