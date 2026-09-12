import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import type { Executor } from '#shared/db/executor.ts'
import { InboxConversation } from '@dorado/contracts'

const sql = sqlFrom(import.meta.dirname)

export async function list(executor?: Executor): Promise<InboxConversation[]> {
  const { rows } = await query(sql('list'), [], executor)
  return rows.map((row) => InboxConversation.parse(row))
}
