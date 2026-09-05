import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import { RefinerView } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export async function viewAll(executor?: Executor): Promise<RefinerView[]> {
  const { rows } = await query<{ view: unknown }>(sql('view_all'), [], executor)
  return rows.map((row) => RefinerView.parse(row.view))
}

export async function viewOne(id: string, executor?: Executor): Promise<RefinerView | undefined> {
  const { rows } = await query<{ view: unknown }>(sql('view_one'), [id], executor)
  return rows[0] === undefined ? undefined : RefinerView.parse(rows[0].view)
}
