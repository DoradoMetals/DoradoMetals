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
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { fulfillments } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

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

// The fulfillments of several ORDERS at once - getByOrder, batched.
//
// `fulfillments_order_uniq` still makes it one row per order, so the caller can
// key the result by order_id without losing anything. Added for D101: every
// hop of "which shipment does this order have" started at getByOrder, and the
// composed order read called it inside a per-order loop.
export async function getByOrders(
  order_ids: string[], executor?: Executor
): Promise<FulfillmentBaseRow[]> {
  if (order_ids.length === 0) return [];
  const { rows } = await query<FulfillmentBaseRow>(
    sql("get_by_orders"), [order_ids], executor
  );
  return rows;
}

// Returns undefined when the order already had one - ON CONFLICT DO NOTHING
// returns no row. That is the normal case for a second call rather than an
// error, and the service reads the existing one back.
export type FulfillmentNew = {
  id: string; order_id: string; method_id: string; status: string;
  created_by_id: string | null;
};

export async function create(
  row: FulfillmentNew, executor?: Executor
): Promise<FulfillmentBaseRow | undefined> {
  const { rows } = await query<FulfillmentBaseRow>(
    sql("create"), [row.id, row.order_id, row.method_id, row.status, row.created_by_id], executor
  );
  return rows[0];
}

// A DRAFT (D208): a fulfillment with no order yet, mutated by the checkout
// flow and attached at order creation. See create_draft.sql.
export type FulfillmentDraftNew = { id: string; method_id: string; created_by_id: string | null };

export async function createDraft(
  row: FulfillmentDraftNew, executor?: Executor
): Promise<FulfillmentBaseRow> {
  const { rows } = await query<FulfillmentBaseRow>(
    sql("create_draft"), [row.id, row.method_id, row.created_by_id], executor
  );
  return rows[0];
}

// THE ONE-WAY ATTACH, kept as its own function rather than folded into
// `update`: it is a state TRANSITION guarded by `WHERE order_id IS NULL`
// (attach_to_order.sql), not a general column patch - order_id is never
// COALESCE-patchable anywhere else, only ever set once, from null.
export async function attachToOrder(
  id: string, patch: { order_id: string; updated_by_id: string | null }, executor?: Executor
): Promise<FulfillmentBaseRow | undefined> {
  const { rows } = await query<FulfillmentBaseRow>(
    sql("attach_to_order"), [id, patch.order_id, patch.updated_by_id], executor
  );
  return rows[0];
}

// ONE UPDATE (D212's CRUD ruling): replaces setStatus and setMethod, which
// were the same UPDATE under two names.
export type FulfillmentPatch = Partial<Pick<FulfillmentBaseRow, "status" | "method_id">>;

export async function update(
  id: string, patch: FulfillmentPatch, updated_by_id: string | null, executor?: Executor
): Promise<boolean> {
  const { rowCount } = await query(
    sql("update"), [patch.status, patch.method_id, updated_by_id, id], executor
  );
  return rowCount === 1;
}
