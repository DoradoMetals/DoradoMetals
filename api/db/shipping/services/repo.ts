import query from '#shared/db/query.ts'
import { buildUpdate } from '#shared/db/patch.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import { CarrierServicePatch } from '@dorado/contracts'
import type {
  CarrierServiceRead,
  CarrierServiceWrite,
  InsuranceCeiling,
  SaleShippingService,
} from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export async function getAll(executor?: Executor): Promise<CarrierServiceRead[]> {
  const { rows } = await query<CarrierServiceRead>(sql('get_all'), [], executor)
  return rows
}

export async function getOne(
  id: string,
  executor?: Executor
): Promise<CarrierServiceRead | undefined> {
  const { rows } = await query<CarrierServiceRead>(sql('get_one'), [id], executor)
  return rows[0]
}

export async function getInsuranceCeilings(
  carrier_id: string,
  executor?: Executor
): Promise<InsuranceCeiling[]> {
  const { rows } = await query<InsuranceCeiling>(
    sql('get_insurance_ceilings'),
    [carrier_id],
    executor
  )
  return rows
}

export async function getByCarrier(
  carrier_id: string,
  executor?: Executor
): Promise<CarrierServiceRead[]> {
  const { rows } = await query<CarrierServiceRead>(sql('get_by_carrier'), [carrier_id], executor)
  return rows
}

export async function create(
  row: CarrierServiceWrite,
  executor?: Executor
): Promise<CarrierServiceRead> {
  const { rows } = await query<CarrierServiceRead>(
    sql('create'),
    [
      row.carrier_id,
      row.name,
      row.description,
      row.code,
      row.provider_code,
      row.supports_pickups,
      row.supports_dropoffs,
      row.supports_returns,
      row.supports_insurance,
      row.is_international,
      row.is_residential,
      row.is_active,
      row.max_weight_lb,
      row.max_length_in,
      row.max_width_in,
      row.max_height_in,
      row.max_declared_value,
      row.min_transit_days,
      row.max_transit_days,
      row.display_order,
    ],
    executor
  )
  return rows[0]
}

const COLUMN_OF: Record<string, string> = {
  supports_pickup: 'supports_pickups',
  supports_dropoff: 'supports_dropoffs',
  max_weight_lbs: 'max_weight_lb',
}

export const PATCHABLE: readonly string[] = Object.keys(CarrierServicePatch.shape)
  .filter((field) => field !== 'id')
  .map((field) => COLUMN_OF[field] ?? field)

export const RETURNING = `id, carrier_id, name, description, code, provider_code,
          supports_pickups  AS supports_pickup,
          supports_dropoffs AS supports_dropoff,
          supports_returns, supports_insurance,
          is_international, is_residential, is_active,
          max_weight_lb     AS max_weight_lbs,
          max_length_in, max_width_in, max_height_in, max_declared_value,
          min_transit_days, max_transit_days, display_order,
          created_by, updated_by, created_at, updated_at`

export async function update(
  id: string,
  patch: Partial<CarrierServiceWrite>,
  executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({
    table: 'shipping.services',
    allowed: PATCHABLE,
    patch,
    where: { id },
    returning: RETURNING,
  })
  if (!built) return true
  const { rowCount } = await query(built.text, built.values, executor)
  return rowCount === 1
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql('delete'), [id], executor)
  return rowCount === 1
}

export async function getSaleOptions(executor?: Executor): Promise<SaleShippingService[]> {
  const { rows } = await query<SaleShippingService>(sql('get_sale_options'), [], executor)
  return rows
}
