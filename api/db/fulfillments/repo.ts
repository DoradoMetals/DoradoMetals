import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Fulfillment } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";
import { FulfillmentPatch } from "@dorado/contracts";

const sql = sqlFrom(import.meta.dirname);

export async function getOne(
  id: string, executor?: Executor
): Promise<Fulfillment | undefined> {
  const { rows } = await query<Fulfillment>(sql("get_one"), [id], executor);
  return rows[0];
}

export async function getByOrder(
  order_id: string, executor?: Executor
): Promise<Fulfillment | undefined> {
  const { rows } = await query<Fulfillment>(sql("get_by_order"), [order_id], executor);
  return rows[0];
}

export async function getMany(
  ids: string[], executor?: Executor
): Promise<Fulfillment[]> {
  if (ids.length === 0) return [];
  const { rows } = await query<Fulfillment>(sql("get_many"), [ids], executor);
  return rows;
}

export async function getByOrders(
  order_ids: string[], executor?: Executor
): Promise<Fulfillment[]> {
  if (order_ids.length === 0) return [];
  const { rows } = await query<Fulfillment>(
    sql("get_by_orders"), [order_ids], executor
  );
  return rows;
}

export async function create(
  row: { order_id: string; method_id: string; status: string }, executor?: Executor
): Promise<Fulfillment | undefined> {
  const { rows } = await query<Fulfillment>(
    sql("create"), [row.order_id, row.method_id, row.status], executor
  );
  return rows[0];
}

export async function createDraft(
  row: { method_id: string }, executor?: Executor
): Promise<Fulfillment> {
  const { rows } = await query<Fulfillment>(
    sql("create_draft"), [row.method_id], executor
  );
  return rows[0];
}

export const PATCHABLE = Object.keys(
  FulfillmentPatch.shape
) as readonly (keyof FulfillmentPatch)[];

export async function update(
  id: string, patch: FulfillmentPatch, executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({
    table: "fulfillments.fulfillments",
    allowed: PATCHABLE,
    patch,
    where: { id },
    whereNull: "order_id" in patch ? ["order_id"] : undefined,
  });
  if (!built) return true;
  const { rowCount } = await query(built.text, built.values, executor);
  return rowCount === 1;
}
