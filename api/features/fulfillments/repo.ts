// fulfillments.fulfillments, and nothing else.
//
// One row per order - `fulfillments_order_uniq` enforces it - naming a method,
// carrying a status, and having exactly one detail row in whichever table its
// method's category points at. The method and the detail are attached by
// compose.ts; the implementation this replaces LEFT JOINed all four tables on
// every read and built three jsonb objects in the projection.
//
// created_by / updated_by (the text columns) are not projected. created_by_id
// and updated_by_id are, because the response has always carried them.
import query from "#shared/db/query.js";
import { sqlFrom } from "#shared/db/sql.ts";
import type { fulfillments } from "@dorado/contracts";
import type { PoolClient } from "pg";

const sql = sqlFrom(import.meta.dirname);

export type Executor = PoolClient | undefined;

export type FulfillmentBaseRow = Pick<
  fulfillments.FulfillmentsRow,
  | "id" | "order_id" | "method_id" | "status" | "created_at" | "updated_at"
  | "created_by" | "updated_by"
  | "created_by_id" | "updated_by_id"
>;

export async function getOne(
  id: string, executor?: Executor
): Promise<FulfillmentBaseRow | undefined> {
  const { rows } = await query<FulfillmentBaseRow>(sql("get_one"), [id], executor);
  return rows[0];
}

export async function getByOrder(
  order_id: string, executor?: Executor
): Promise<FulfillmentBaseRow | undefined> {
  const { rows } = await query<FulfillmentBaseRow>(sql("get_by_order"), [order_id], executor);
  return rows[0];
}

export async function getMany(
  ids: string[], executor?: Executor
): Promise<FulfillmentBaseRow[]> {
  if (ids.length === 0) return [];
  const { rows } = await query<FulfillmentBaseRow>(sql("get_many"), [ids], executor);
  return rows;
}

// Returns undefined when the order already had one - ON CONFLICT DO NOTHING
// returns no row. That is the normal case for a second call rather than an
// error, and the service reads the existing one back.
export async function create(
  id: string, order_id: string, method_id: string,
  status: string, created_by_id: string | null, executor?: Executor
): Promise<FulfillmentBaseRow | undefined> {
  const { rows } = await query<FulfillmentBaseRow>(
    sql("create"), [id, order_id, method_id, status, created_by_id], executor
  );
  return rows[0];
}

export async function setStatus(
  id: string, status: string, updated_by_id: string | null, executor?: Executor
): Promise<FulfillmentBaseRow | undefined> {
  const { rows } = await query<FulfillmentBaseRow>(
    sql("set_status"), [status, updated_by_id, id], executor
  );
  return rows[0];
}

export async function setMethod(
  id: string, method_id: string, updated_by_id: string | null, executor?: Executor
): Promise<FulfillmentBaseRow | undefined> {
  const { rows } = await query<FulfillmentBaseRow>(
    sql("set_method"), [method_id, updated_by_id, id], executor
  );
  return rows[0];
}
