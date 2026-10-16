import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import { HoldAtLocation, LocationView } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export async function getAll(
  organization_id: string | null,
  executor?: Executor
): Promise<LocationView[]> {
  const { rows } = await query(sql('get_all'), [organization_id], executor)
  return rows.map((row) => LocationView.parse(row))
}

export async function defaultReturn(executor?: Executor): Promise<HoldAtLocation | undefined> {
  const { rows } = await query(sql('default_return'), [], executor)
  return rows[0] === undefined ? undefined : HoldAtLocation.parse(rows[0])
}
