import query from '#shared/db/query.ts'
import { buildUpdate } from '#shared/db/patch.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import { columnsOf } from '#shared/db/columns.ts'
import { PaymentView as View, TransferGuard as Guard, TransferPatch } from '@dorado/contracts'
import type {
  PaymentView,
  Transfer,
  TransferGuard,
  TransferKind,
  TransferPatch as Patch,
  TransferWrite,
} from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export const PATCHABLE = columnsOf(TransferPatch)
const GUARDABLE = columnsOf(Guard)

export async function create(row: TransferWrite, executor?: Executor): Promise<Transfer | undefined> {
  const { rows } = await query<Transfer>(
    sql(row.refining_order_id ? 'create_refining' : 'create'),
    [
      row.refining_order_id ?? row.order_id,
      row.kind,
      row.rail,
      row.state,
      row.amount,
      row.counterparty_user_id ?? null,
      row.details_id ?? null,
      row.bank_link_id ?? null,
      row.provider ?? null,
      row.provider_ref ?? null,
      row.reference ?? null,
      row.idempotency_key ?? null,
    ],
    executor
  )
  return rows[0]
}

export async function getOne(id: string, executor?: Executor): Promise<Transfer | undefined> {
  const { rows } = await query<Transfer>(sql('get_one'), [id], executor)
  return rows[0]
}

export async function getForOrder(
  order_id: string,
  kind: TransferKind,
  executor?: Executor
): Promise<Transfer | undefined> {
  const { rows } = await query<Transfer>(sql('get_for_order'), [order_id, kind], executor)
  return rows[0]
}

export async function findByProviderRef(
  provider: string,
  provider_ref: string,
  executor?: Executor
): Promise<Transfer | undefined> {
  const { rows } = await query<Transfer>(
    sql('find_by_provider_ref'),
    [provider, provider_ref],
    executor
  )
  return rows[0]
}

export async function listForOrder(order_id: string, executor?: Executor): Promise<Transfer[]> {
  const { rows } = await query<Transfer>(sql('list_for_order'), [order_id], executor)
  return rows
}

export async function view(order_id: string, executor?: Executor): Promise<PaymentView | undefined> {
  const { rows } = await query(sql('payment_view'), [order_id], executor)
  return rows[0] === undefined ? undefined : View.parse(rows[0])
}

export async function viewRefining(
  refining_order_id: string,
  executor?: Executor
): Promise<PaymentView | undefined> {
  const { rows } = await query(sql('payment_view_refining'), [refining_order_id], executor)
  return rows[0] === undefined ? undefined : View.parse(rows[0])
}

export async function getForRefiningOrder(
  refining_order_id: string,
  kind: TransferKind,
  executor?: Executor
): Promise<Transfer | undefined> {
  const { rows } = await query<Transfer>(
    sql('get_for_refining_order'),
    [refining_order_id, kind],
    executor
  )
  return rows[0]
}

export async function update(
  id: string,
  patch: Patch,
  guard: TransferGuard = {},
  executor?: Executor
): Promise<boolean> {
  const where: Record<string, unknown> = { id }
  for (const g of GUARDABLE) if (g in guard) where[g] = guard[g]
  const built = buildUpdate({
    table: 'payments.transfers',
    allowed: PATCHABLE,
    patch,
    where,
    casts: {
      state: 'payments.transfer_state',
      rail: 'payments.rail',
      kind: 'payments.transfer_kind',
    },
  })
  if (!built) return true
  const { rowCount } = await query(built.text, built.values, executor)
  return rowCount === 1
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql('delete'), [id], executor)
  return rowCount === 1
}
