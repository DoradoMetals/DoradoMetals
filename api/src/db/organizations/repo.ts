import query from '#shared/db/query.ts'
import { buildUpdate } from '#shared/db/patch.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import { OrganizationPatch } from '@dorado/contracts'
import type { Organization } from '@dorado/contracts'
import { columnsOf } from '#shared/db/columns.ts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export const PATCHABLE = columnsOf(OrganizationPatch)

export async function create(
  row: Partial<OrganizationPatch> | undefined,
  type: string,
  executor?: Executor
): Promise<Organization> {
  const { rows } = await query<Organization>(
    sql('create'),
    [type, row?.name, row?.email, row?.phone, row?.enabled],
    executor
  )
  return rows[0]
}

export async function update(
  id: string,
  row: Partial<OrganizationPatch> | undefined,
  executor?: Executor
): Promise<boolean> {
  // The caller's patch travels as it was written. `buildUpdate` already says
  // what each shape means - a key present is set, an explicit null clears, an
  // absent key is left alone - and coalescing every absent field to null here
  // turned "edit the logo" into "wipe the name, email and phone" (MA F3).
  const built = buildUpdate({
    table: 'organizations.organizations',
    allowed: PATCHABLE,
    patch: row ?? {},
    where: { id },
  })
  if (!built) return false
  const r = await query(built.text, built.values, executor)
  return r.rowCount === 1
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const r = await query(sql('delete'), [id], executor)
  return r.rowCount === 1
}

export async function list(executor?: Executor): Promise<Organization[]> {
  const { rows } = await query<Organization>(sql('get_all'), [], executor)
  return rows
}

export async function getOne(id: string, executor?: Executor): Promise<Organization | undefined> {
  const { rows } = await query<Organization>(sql('get_one'), [id], executor)
  return rows[0]
}

export async function byId(executor?: Executor): Promise<Map<string, Organization>> {
  const rows = await list(executor)
  return new Map(rows.map((o) => [o.id, o]))
}
