// orders.transactions - CRUD only. WHAT ONE ORDER CAME TO; not the customer's
// credit BALANCE, which is payments/transactions. Two things, one word.
import { randomUUID } from "node:crypto";
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { orders } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type OrderTotalsRow = orders.TransactionsRow;

export async function getFor(
  order_id: string, executor?: Executor
): Promise<OrderTotalsRow | undefined> {
  const { rows } = await query<OrderTotalsRow>(sql("get_for"), [order_id], executor);
  return rows[0];
}

export async function getMany(
  order_ids: string[], executor?: Executor
): Promise<OrderTotalsRow[]> {
  if (order_ids.length === 0) return [];
  const { rows } = await query<OrderTotalsRow>(sql("get_many"), [order_ids], executor);
  return rows;
}

// ONE UPDATE, KEYED BY ORDER. Every amount is NULLABLE AND NULL IS MEANINGFUL -
// "no longer priced" is what clearing pricing writes - so buildUpdate's
// absent/null/value distinction is load-bearing.
//
// The direction guard is evaluated IN THE STATEMENT: a payout-fee waiver is a
// purchase fact and a sale must answer "not written". It is a cross-table
// EXISTS, which buildUpdate's WHERE cannot spell, so it is appended.
const PATCHABLE = [
  "total", "shipping_fee_actual", "refiner_fee", "pool_oz_deducted",
  "pool_remediation", "payout_fee", "waive_payout_fee", "payout_details_id",
] as const;
type TotalsColumn = (typeof PATCHABLE)[number];
export type TotalsPatch = Partial<Record<TotalsColumn, string | number | boolean | null>>;
export type TotalsGuard = { direction?: "purchase" | "sale" };

export async function update(
  order_id: string, patch: TotalsPatch, guard: TotalsGuard = {}, executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({
    table: "orders.transactions",
    allowed: PATCHABLE,
    patch,
    where: { order_id },
    returning: "id",
  });
  if (!built) return true;

  // buildUpdate hands back a fresh array each call, so the guard's parameter is
  // pushed onto it rather than onto a copy of it.
  let { text } = built;
  const { values } = built;
  if (guard.direction) {
    values.push(guard.direction);
    text = text.replace(
      "\n RETURNING",
      `\n   AND EXISTS (SELECT 1 FROM orders.orders o
                  WHERE o.id = orders.transactions.order_id
                    AND o.direction = $${values.length}::orders.direction)\n RETURNING`
    );
  }
  const { rowCount } = await query(text, values, executor);
  return rowCount === 1;
}

export type NewOrderTotals = {
  id?: string; order_id: string;
  total?: number | null; shipping?: number | null; shipping_service?: string | null;
  funds?: number | null; post_charges_amount?: number | null;
  subject_to_charges_amount?: number | null; used_funds?: boolean | null;
  items?: number | null; base_total?: number | null; surcharge?: number | null;
  sales_tax?: number | null;
};

export async function create(row: NewOrderTotals, executor?: Executor): Promise<void> {
  await query(
    sql("create"),
    [
      row.id ?? randomUUID(), row.order_id,
      row.total ?? null, row.shipping ?? null, row.shipping_service ?? null,
      row.funds ?? null, row.post_charges_amount ?? null,
      row.subject_to_charges_amount ?? null, row.used_funds ?? null,
      row.items ?? null, row.base_total ?? null, row.surcharge ?? null,
      row.sales_tax ?? null,
    ],
    executor
  );
}
