import query from '#shared/db/query.ts'
import { buildUpdate } from '#shared/db/patch.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import { AddressWriteColumns } from '@dorado/contracts'
import type { Address, AddressPatch } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export const PATCHABLE = Object.keys(AddressWriteColumns.shape) as readonly string[]

export async function getOne(id: string, executor?: Executor): Promise<Address | undefined> {
  const { rows } = await query<Address>(sql('get_one'), [id], executor)
  return rows[0]
}

export async function getMany(ids: string[], executor?: Executor): Promise<Address[]> {
  if (ids.length === 0) return []
  const { rows } = await query<Address>(sql('get_many'), [ids], executor)
  return rows
}

export async function create(patch: AddressPatch, executor?: Executor): Promise<Address> {
  const { rows } = await query<Address>(
    sql('create'),
    [
      patch.line_1,
      patch.line_2,
      patch.city,
      patch.state,
      patch.country,
      patch.zip,
      patch.country_code,
      patch.phone_number,
      true,
      false,
    ],
    executor
  )
  return rows[0]
}

export async function update(
  id: string,
  patch: AddressWriteColumns,
  executor?: Executor
): Promise<Address | undefined> {
  const built = buildUpdate({
    table: 'places.addresses',
    allowed: PATCHABLE,
    patch,
    where: { id },
    returning:
      'id, line_1, line_2, city, state, country, zip, country_code, ' +
      'phone_number, created_at, updated_at, is_valid, is_residential',
  })
  if (!built) return await getOne(id, executor)
  const { rows } = await query<Address>(built.text, built.values, executor)
  return rows[0]
}

export async function isReferenced(id: string, executor?: Executor): Promise<boolean> {
  const { rows } = await query<{ referenced: boolean }>(sql('is_referenced'), [id], executor)
  return rows[0]?.referenced === true
}

export async function isActive(
  address_id: string,
  user_id: string,
  executor?: Executor
): Promise<boolean> {
  const { rows } = await query<{ locked: boolean }>(
    sql('is_active'),
    [address_id, user_id],
    executor
  )
  return rows[0]?.locked === true
}

export async function activeAmong(
  ids: string[],
  user_id: string,
  executor?: Executor
): Promise<string[]> {
  if (ids.length === 0) return []
  const { rows } = await query<{ source_address_id: string }>(
    sql('active_among'),
    [ids, user_id],
    executor
  )
  return rows.map((r) => r.source_address_id)
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const r = await query(sql('delete'), [id], executor)
  return r.rowCount === 1
}

export async function snapshot(address_id: string, executor?: Executor): Promise<string | null> {
  const { rows } = await query<{ id: string }>(sql('snapshot'), [address_id], executor)
  return rows[0]?.id ?? null
}
