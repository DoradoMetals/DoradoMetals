import query from '#shared/db/query.ts'
import { buildUpdate } from '#shared/db/patch.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import { columnsOf } from '#shared/db/columns.ts'
import { BankLinkPatch } from '@dorado/contracts'
import type { BankLink, BankLinkPatch as Patch, BankLinkWrite } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export const PATCHABLE = columnsOf(BankLinkPatch)

export async function create(row: BankLinkWrite, executor?: Executor): Promise<BankLink> {
  const { rows } = await query<BankLink>(
    sql('create'),
    [
      row.user_id,
      row.provider,
      row.moov_account_id,
      row.moov_bank_account_id ?? null,
      row.payment_method_id ?? null,
      row.rail ?? null,
      row.holder_name ?? null,
      row.bank_name ?? null,
      row.last_four ?? null,
      row.status,
      row.linked_by,
    ],
    executor
  )
  return rows[0] as BankLink
}

export async function getOne(id: string, executor?: Executor): Promise<BankLink | undefined> {
  const { rows } = await query<BankLink>(sql('get_one'), [id], executor)
  return rows[0]
}

export async function listForUser(user_id: string, executor?: Executor): Promise<BankLink[]> {
  const { rows } = await query<BankLink>(sql('list_for_user'), [user_id], executor)
  return rows
}

export async function findAccount(
  user_id: string,
  executor?: Executor
): Promise<BankLink | undefined> {
  const { rows } = await query<BankLink>(sql('find_account'), [user_id], executor)
  return rows[0]
}

export async function update(id: string, patch: Patch, executor?: Executor): Promise<boolean> {
  const built = buildUpdate({
    table: 'payments.bank_links',
    allowed: PATCHABLE,
    patch,
    where: { id },
    casts: { status: 'payments.link_status', rail: 'payments.rail' },
  })
  if (!built) return true
  const { rowCount } = await query(built.text, built.values, executor)
  return rowCount === 1
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql('delete'), [id], executor)
  return rowCount === 1
}
