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
import { buildUpdate } from "#shared/db/patch.ts";
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
// created_by_id IS NOT A FIELD OF THIS TYPE any more - the trigger writes it.
export type FulfillmentNew = {
  id: string; order_id: string; method_id: string; status: string;
};

export async function create(
  row: FulfillmentNew, executor?: Executor
): Promise<FulfillmentBaseRow | undefined> {
  const { rows } = await query<FulfillmentBaseRow>(
    sql("create"), [row.id, row.order_id, row.method_id, row.status], executor
  );
  return rows[0];
}

// A DRAFT (D208): a fulfillment with no order yet, mutated by the checkout
// flow and attached at order creation. See create_draft.sql.
// created_by_id IS NOT A FIELD OF THIS TYPE any more - the trigger writes it.
export type FulfillmentDraftNew = { id: string; method_id: string };

export async function createDraft(
  row: FulfillmentDraftNew, executor?: Executor
): Promise<FulfillmentBaseRow> {
  const { rows } = await query<FulfillmentBaseRow>(
    sql("create_draft"), [row.id, row.method_id], executor
  );
  return rows[0];
}

// THE ONE-WAY ATTACH, kept as its own function rather than folded into
// `update`: it is a state TRANSITION guarded by `WHERE order_id IS NULL`
// (attach_to_order.sql), not a general column patch - order_id is never
// COALESCE-patchable anywhere else, only ever set once, from null.
export async function attachToOrder(
  id: string, patch: { order_id: string }, executor?: Executor
): Promise<FulfillmentBaseRow | undefined> {
  const { rows } = await query<FulfillmentBaseRow>(
    sql("attach_to_order"), [id, patch.order_id], executor
  );
  return rows[0];
}

// ONE UPDATE (D212's CRUD ruling): replaces setStatus and setMethod, which
// were the same UPDATE under two names.
export const PATCHABLE = ["status", "method_id"] as const;

export type FulfillmentPatch = Partial<Pick<FulfillmentBaseRow, (typeof PATCHABLE)[number]>>;

//
// THE INTERIM ACTOR ARGUMENT IS GONE. `update` took `updated_by_id` as a third
// parameter, threaded down from the session by every caller; public.audit_stamp
// writes it from the connection now (migration 116), so the signature is the
// two-argument one every other repo has.
export async function update(
  id: string, patch: FulfillmentPatch, executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({
    table: "fulfillments.fulfillments", allowed: PATCHABLE, patch, where: { id },
  });
  if (!built) return true;
  const { rowCount } = await query(built.text, built.values, executor);
  return rowCount === 1;
}
