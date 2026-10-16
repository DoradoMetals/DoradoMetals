import query from '#shared/db/query.ts'
import { buildUpdate } from '#shared/db/patch.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import type { Executor } from '#shared/db/executor.ts'
import { columnsOf } from '#shared/db/columns.ts'
import { ShipmentClaimPatch, ShipmentClaimView } from '@dorado/contracts'
import type { ShipmentClaimWrite } from '@dorado/contracts'

const sql = sqlFrom(import.meta.dirname)

export const PATCHABLE = columnsOf(ShipmentClaimPatch)

export async function create(
  row: ShipmentClaimWrite,
  executor?: Executor
): Promise<ShipmentClaimView> {
  const { rows } = await query(
    sql('create'),
    [row.shipment_id, row.kind, row.amount, row.carrier_claim_number ?? null, row.note ?? null],
    executor
  )
  return ShipmentClaimView.parse(rows[0])
}

export async function getOne(
  id: string,
  executor?: Executor
): Promise<ShipmentClaimView | undefined> {
  const { rows } = await query(sql('get_one'), [id], executor)
  return rows[0] ? ShipmentClaimView.parse(rows[0]) : undefined
}

export async function listFor(
  shipment_id: string,
  executor?: Executor
): Promise<ShipmentClaimView[]> {
  const { rows } = await query(sql('list_for'), [shipment_id], executor)
  return rows.map((row) => ShipmentClaimView.parse(row))
}

export async function listForOrder(
  order_id: string,
  executor?: Executor
): Promise<ShipmentClaimView[]> {
  const { rows } = await query(sql('list_for_order'), [order_id], executor)
  return rows.map((row) => ShipmentClaimView.parse(row))
}

export async function update(
  id: string,
  patch: ShipmentClaimPatch,
  executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({
    table: 'shipping.claims',
    allowed: PATCHABLE,
    patch,
    where: { id },
  })
  if (!built) return true
  const { rowCount } = await query(built.text, built.values, executor)
  return rowCount === 1
}
