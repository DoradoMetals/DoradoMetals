import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import { HoldAtLocation } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export async function defaultReturn(executor?: Executor): Promise<HoldAtLocation | undefined> {
  const { rows } = await query(sql('default_return'), [], executor)
  return rows[0] === undefined ? undefined : HoldAtLocation.parse(rows[0])
}
