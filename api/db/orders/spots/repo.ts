// orders.spots - CRUD only. The spots an order was quoted at. EVERY money
// figure on the order derives from these, so a wrong one misprices all of it.
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Executor } from "#shared/db/executor.ts";
import { columnsOf } from "#shared/db/columns.ts";
import { OrderSpot, OrderSpotPatch } from "@dorado/contracts";
import type { OrderSpotNamed } from "@dorado/contracts";

const sql = sqlFrom(import.meta.dirname);

// The metal's NAME joined on (`OrderSpotNamed`) - what the PDFs, the emails
// and the refiner surfaces read. percent_change and dollar_change are
// projected NULL.
export async function getFor(
  order_id: string, executor?: Executor
): Promise<OrderSpotNamed[]> {
  const { rows } = await query<OrderSpotNamed>(sql("get_for"), [order_id], executor);
  return rows;
}

export async function getMany(
  order_ids: string[], executor?: Executor
): Promise<OrderSpotNamed[]> {
  if (order_ids.length === 0) return [];
  const { rows } = await query<OrderSpotNamed>(sql("get_many"), [order_ids], executor);
  return rows;
}

// The VERBATIM table rows (ruling 12) - what GET /orders/:id/spots serves.
export async function getRowsFor(
  order_id: string, executor?: Executor
): Promise<OrderSpot[]> {
  const { rows } = await query<OrderSpot>(sql("get_rows_for"), [order_id], executor);
  return rows;
}

// ONE FROZEN QUOTE PER METAL THE ORDER CONTAINS, copied from the live feed by
// the statement (ruling 66). A metal with no live quote does not join, so the
// answer is SHORT - the caller compares it against the metals it asked for and
// refuses, because a null spot prices that metal at zero.
export async function freezeForOrder(
  order_id: string, executor?: Executor
): Promise<Pick<OrderSpot, "id" | "order_id" | "metal_id" | "ask" | "bid">[]> {
  const { rows } = await query<Pick<OrderSpot, "id" | "order_id" | "metal_id" | "ask" | "bid">>(
    sql("freeze"), [order_id], executor
  );
  return rows;
}

// ONE UPDATE, keyed on (order_id, metal_id). `bid` ONLY: the ask is what the
// same metal sells for, and writing it here would lose a number this never owned.
// THE COLUMN, FROM THE CONTRACT (ruling 64). Only the BID: the ask is what the
// same metal sells for and this table never quotes it.
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
