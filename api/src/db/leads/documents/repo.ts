import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import { LeadDocumentView } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export async function forLead(lead_id: string, executor?: Executor): Promise<LeadDocumentView[]> {
  const { rows } = await query(sql('get_all'), [lead_id], executor)
  return rows.map((row) => LeadDocumentView.parse(row))
}

export async function create(
  lead_id: string,
  pdf_id: string,
  executor?: Executor
): Promise<LeadDocumentView> {
  const { rows } = await query(sql('create'), [lead_id, pdf_id], executor)
  return LeadDocumentView.parse(rows[0])
}

export async function remove(
  lead_id: string,
  pdf_id: string,
  executor?: Executor
): Promise<boolean> {
  const { rowCount } = await query(sql('delete'), [lead_id, pdf_id], executor)
  return rowCount === 1
}
