import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Fulfillment, FulfillmentViewFacts } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";
import { FulfillmentPatch, FulfillmentViewFacts as Facts } from "@dorado/contracts";

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

export async function view(
  ids: string[] | null,
  order_id: string | null,
  scheduled: boolean,
  from: string | null,
  to: string | null,
  employee_id: string | null,
  executor?: Executor
): Promise<FulfillmentViewFacts[]> {
  const { rows } = await query(
    sql("view"), [ids, order_id, scheduled, from, to, employee_id], executor
  );
  return rows.map((row) => Facts.parse(row));
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
  id: string, order_id: string, method_id: string, status: string, executor?: Executor
): Promise<Fulfillment | undefined> {
  const { rows } = await query<Fulfillment>(
    sql("create"), [id, order_id, method_id, status], executor
  );
  return rows[0];
}

export async function createDraft(
  id: string, method_id: string, executor?: Executor
): Promise<Fulfillment> {
  const { rows } = await query<Fulfillment>(
    sql("create_draft"), [id, method_id], executor
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
