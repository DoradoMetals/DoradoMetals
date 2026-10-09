import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import { DURATION_LABEL } from '#db/crm/calls/repo.ts'
import type { Executor } from '#shared/db/executor.ts'
import { InboxConversation } from '@dorado/contracts'

const sql = sqlFrom(import.meta.dirname)

const LIST_SQL = sql('list').replace('/*__duration_label__*/', DURATION_LABEL)

export async function list(executor?: Executor): Promise<InboxConversation[]> {
  const { rows } = await query(LIST_SQL, [], executor)
  return rows.map((row) => InboxConversation.parse(row))
}
