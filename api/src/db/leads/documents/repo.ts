import query from '#shared/db/query.ts'
import { expression, sqlFrom } from '#shared/db/sql.ts'
import { LeadDocumentKind, LeadDocumentView } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

const nameOf = (column: string) => expression(sql('document_name')).replaceAll('$kind', column)
const named = (file: string, column: string) =>
  sql(file).replaceAll('/*__document_name__*/', nameOf(column))

export async function forLead(lead_id: string, executor?: Executor): Promise<LeadDocumentView[]> {
  const { rows } = await query(named('get_all', 'p.kind'), [lead_id], executor)
  return rows.map((row) => LeadDocumentView.parse(row))
}

export async function getOne(
  lead_id: string,
  pdf_id: string,
  executor?: Executor
): Promise<LeadDocumentView | null> {
  const { rows } = await query(named('get_one', 'p.kind'), [lead_id, pdf_id], executor)
  return rows[0] ? LeadDocumentView.parse(rows[0]) : null
}

export async function create(
  lead_id: string,
  pdf_id: string,
  executor?: Executor
): Promise<LeadDocumentView> {
  const { rows } = await query(named('create', 'p.kind'), [lead_id, pdf_id], executor)
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

export async function namedKinds(executor?: Executor): Promise<LeadDocumentKind[]> {
  const { rows } = await query(named('named_kinds', 'v.kind'), [], executor)
  return rows.map((row) => LeadDocumentKind.parse(row))
}
