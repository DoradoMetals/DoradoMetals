import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import type { OfferedPackage, Package } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export async function getAll(executor?: Executor): Promise<Package[]> {
  const { rows } = await query<Package>(sql('get_all'), [], executor)
  return rows
}

export async function getOne(id: string, executor?: Executor): Promise<Package | undefined> {
  const { rows } = await query<Package>(sql('get_one'), [id], executor)
  return rows[0]
}

export async function find(
  carrier_id: string,
  label: string,
  executor?: Executor
): Promise<Package | undefined> {
  const { rows } = await query<Package>(sql('find'), [carrier_id, label], executor)
  return rows[0]
}

export async function labelsById(executor?: Executor): Promise<Map<string, string>> {
  return new Map((await getAll(executor)).map((p) => [p.id, p.label]))
}

export async function defaultReturn(executor?: Executor): Promise<Package | undefined> {
  const { rows } = await query<Package>(sql('default_return'), [], executor)
  return rows[0]
}

export async function getOffered(executor?: Executor): Promise<OfferedPackage[]> {
  const { rows } = await query<OfferedPackage>(sql('get_offered'), [], executor)
  return rows
}
