// exchange.shipments. THIS FILE IS SCHEDULED FOR DELETION.
//
// exchange keeps the order link, the service name and the package name on the
// shipment's own row, so this takes all three where the new schema takes ids
// and a fulfillment.
import query from "#shared/db/query.js";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Executor } from "#features/shipping/shipments/repo.ts";

const sql = sqlFrom(import.meta.dirname);

export type LegacyCreate = {
  purchase_order_id?: string | null;
  sales_order_id?: string | null;
  carrier_id?: string | null;
  type?: string | null;
};

export async function create(
  id: string, s: LegacyCreate, executor?: Executor
): Promise<void> {
  await query(
    sql("create"),
    [id, s.purchase_order_id ?? null, s.sales_order_id ?? null,
     s.carrier_id ?? null, s.type ?? null],
    executor
  );
}

// Takes the NAMES, not the ids - see sql/legacy/update.sql. The order is the
// same as the new schema's up to the two that differ, so one call site builds
// both.
export type LegacyValues = [
  string | null, string | null,
  Date | string | null, Date | string | null, Date | string | null,
  string | Buffer | null, string | null, string | null,
  string | null, string | null,
  number | null, boolean, number | null, string | null, string | null,
];

export async function update(
  id: string, values: LegacyValues, executor?: Executor
): Promise<void> {
  await query(sql("update"), [...values, id], executor);
}

// net_charge is what exchange calls `cost`.
export async function setChargeForOrder(
  orderId: string, cost: number | null, executor?: Executor
): Promise<string[]> {
  const { rows } = await query<{ id: string }>(
    sql("set_charge_for_order"), [cost, orderId], executor
  );
  return rows.map((r) => r.id);
}

export async function remove(id: string, executor?: Executor): Promise<void> {
  await query(sql("delete"), [id], executor);
}
