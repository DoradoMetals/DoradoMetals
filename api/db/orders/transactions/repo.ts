import { randomUUID } from "node:crypto";
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Executor } from "#shared/db/executor.ts";
import { columnsOf } from "#shared/db/columns.ts";
import { OrderTotals, OrderTotalsWrite } from "@dorado/contracts";
import type { Direction, OrderTotalsPatch } from "@dorado/contracts";

const sql = sqlFrom(import.meta.dirname);

export async function getFor(
  order_id: string, executor?: Executor
): Promise<OrderTotals | undefined> {
  const { rows } = await query<OrderTotals>(sql("get_for"), [order_id], executor);
  return rows[0];
}

export async function getMany(
  order_ids: string[], executor?: Executor
): Promise<OrderTotals[]> {
  if (order_ids.length === 0) return [];
  const { rows } = await query<OrderTotals>(sql("get_many"), [order_ids], executor);
  return rows;
}

const PATCHABLE = columnsOf(OrderTotalsWrite);

export async function update(
  order_id: string,
  patch: OrderTotalsWrite,
  guard: { direction?: Direction } = {},
  executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({
    table: "orders.transactions",
    allowed: PATCHABLE,
    patch,
    where: { order_id },
    returning: "id",
  });
  if (!built) return true;

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

export async function createForCheckout(
  { order_id, checkout_id, payout_fee }:
    { order_id: string; checkout_id: string; payout_fee: number },
  executor?: Executor
): Promise<OrderTotals | undefined> {
  const { rows } = await query<OrderTotals>(
    sql("create_for_purchase"), [order_id, payout_fee, checkout_id], executor
  );
  return rows[0];
}

export async function create(row: OrderTotalsPatch, executor?: Executor): Promise<void> {
  await query(
    sql("create"),
    [
      randomUUID(), row.order_id,
      row.total ?? null, row.shipping ?? null, row.shipping_service ?? null,
      row.funds ?? null, row.post_charges_amount ?? null,
      row.subject_to_charges_amount ?? null, row.used_funds ?? null,
      row.items ?? null, row.base_total ?? null, row.surcharge ?? null,
      row.sales_tax ?? null, row.payout_fee ?? null, row.payout_details_id ?? null,
    ],
    executor
  );
}
