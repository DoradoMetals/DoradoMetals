import query from '#shared/db/query.ts'
import { buildUpdate } from '#shared/db/patch.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import { columnsOf } from '#shared/db/columns.ts'
import { InboundTransactionPatch, MatchCandidate as Candidate } from '@dorado/contracts'
import type {
  InboundSource,
  InboundTransaction,
  InboundTransactionPatch as Patch,
  InboundTransactionWrite,
  MatchCandidate,
} from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export const PATCHABLE = columnsOf(InboundTransactionPatch)

export async function create(
  row: InboundTransactionWrite,
  executor?: Executor
): Promise<InboundTransaction | undefined> {
  const { rows } = await query<InboundTransaction>(
    sql('create'),
    [
      row.source,
      row.external_id ?? null,
      row.amount,
      row.occurred_at,
      row.counterparty_name ?? null,
      row.memo ?? null,
      row.account_ref ?? null,
    ],
    executor
  )
  return rows[0]
}

export async function getOne(
  id: string,
  executor?: Executor
): Promise<InboundTransaction | undefined> {
  const { rows } = await query<InboundTransaction>(sql('get_one'), [id], executor)
  return rows[0]
}

export async function findByExternal(
  source: InboundSource,
  external_id: string,
  executor?: Executor
): Promise<InboundTransaction | undefined> {
  const { rows } = await query<InboundTransaction>(
    sql('find_by_external'),
    [source, external_id],
    executor
  )
  return rows[0]
}

export async function listUnmatched(executor?: Executor): Promise<InboundTransaction[]> {
  const { rows } = await query<InboundTransaction>(sql('list_unmatched'), [], executor)
  return rows
}

export async function candidates(
  order_id: string,
  account_ref: string | null,
  executor?: Executor
): Promise<MatchCandidate[]> {
  const { rows } = await query(sql('candidates'), [order_id, account_ref], executor)
  return rows.map((row) => Candidate.parse(row))
}

export async function update(id: string, patch: Patch, executor?: Executor): Promise<boolean> {
  const built = buildUpdate({
    table: 'payments.inbound_transactions',
    allowed: PATCHABLE,
    patch,
    where: { id },
    casts: { state: 'payments.match_state' },
  })
  if (!built) return true
  const { rowCount } = await query(built.text, built.values, executor)
  return rowCount === 1
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql('delete'), [id], executor)
  return rowCount === 1
}
