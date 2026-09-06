import query from '#shared/db/query.ts'
import { buildUpdate } from '#shared/db/patch.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import { columnsOf } from '#shared/db/columns.ts'
import { FulfillmentDropoffPatchColumns } from '@dorado/contracts'
import type { FulfillmentDropoff } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export const PATCHABLE = columnsOf(FulfillmentDropoffPatchColumns)

export async function getFor(
  fulfillment_id: string,
  executor?: Executor
): Promise<FulfillmentDropoff | undefined> {
  const { rows } = await query<FulfillmentDropoff>(sql('get_for'), [fulfillment_id], executor)
  return rows[0]
}

export async function create(
  row: Pick<FulfillmentDropoff, 'fulfillment_id'> & FulfillmentDropoffPatchColumns,
  executor?: Executor
): Promise<FulfillmentDropoff> {
  const { rows } = await query<FulfillmentDropoff>(
    sql('create'),
    [
      row.fulfillment_id,
      row.refiner_id ?? null,
      row.location_id ?? null,
      row.driver_employee_id ?? null,
      row.start_time ?? null,
      row.end_time ?? null,
    ],
    executor
  )
  return rows[0]
}

export async function update(
  fulfillment_id: string,
  patch: FulfillmentDropoffPatchColumns,
  executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({
    table: 'fulfillments.dropoffs',
    allowed: PATCHABLE,
    patch,
    where: { fulfillment_id },
  })
  if (!built) return true
  const { rowCount } = await query(built.text, built.values, executor)
  return rowCount === 1
}

export async function remove(fulfillment_id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql('delete'), [fulfillment_id], executor)
  return rowCount === 1
}
