import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Executor } from "#shared/db/executor.ts";
import { columnsOf } from "#shared/db/columns.ts";
import { OrderSpot, OrderSpotPatch } from "@dorado/contracts";

const sql = sqlFrom(import.meta.dirname);

export async function getRowsFor(
  order_id: string, executor?: Executor
): Promise<OrderSpot[]> {
  const { rows } = await query<OrderSpot>(sql("get_rows_for"), [order_id], executor);
  return rows;
}

export async function freezeForOrder(
  order_id: string, executor?: Executor
): Promise<Pick<OrderSpot, "id" | "order_id" | "metal_id" | "ask" | "bid">[]> {
  const { rows } = await query<Pick<OrderSpot, "id" | "order_id" | "metal_id" | "ask" | "bid">>(
    sql("freeze"), [order_id], executor
  );
  return rows;
}

export const PATCHABLE = columnsOf(OrderSpotPatch);

export async function update(
  order_id: string, metal_id: string, patch: OrderSpotPatch, executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({
    table: "orders.spots",
    allowed: PATCHABLE,
    patch,
    where: { order_id, metal_id },
    returning: "id",
  });
  if (!built) return true;
  const { rowCount } = await query(built.text, built.values, executor);
  return rowCount === 1;
}
