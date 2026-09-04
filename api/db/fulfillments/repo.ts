// fulfillments.fulfillments: one row per order (fulfillments_order_uniq), naming a method and status; the detail row lives in whichever table the method's category points at. compose.ts attaches both.
// created_by/updated_by (text) aren't projected; created_by_id/updated_by_id are - the wire has always carried them.
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

// getByOrder, batched - one row per order (fulfillments_order_uniq), so the caller can key results by order_id.
export async function getByOrders(
  order_ids: string[], executor?: Executor
): Promise<Fulfillment[]> {
  if (order_ids.length === 0) return [];
  const { rows } = await query<Fulfillment>(
    sql("get_by_orders"), [order_ids], executor
  );
  return rows;
}

// Returns undefined when the order already has one - ON CONFLICT DO NOTHING, the normal case for a retry, not an error.
// created_by_id is not a field here - the audit trigger writes it.
export async function create(
  row: { id: string; order_id: string; method_id: string; status: string }, executor?: Executor
): Promise<Fulfillment | undefined> {
  const { rows } = await query<Fulfillment>(
    sql("create"), [row.id, row.order_id, row.method_id, row.status], executor
  );
  return rows[0];
}

// A draft: a fulfillment with no order yet, mutated by checkout and attached at order creation.
// created_by_id is not a field here - the audit trigger writes it.
export async function createDraft(
  row: { id: string; method_id: string }, executor?: Executor
): Promise<Fulfillment> {
  const { rows } = await query<Fulfillment>(
    sql("create_draft"), [row.id, row.method_id], executor
  );
  return rows[0];
}

// THE COLUMNS, FROM THE CONTRACT (ruling 64). One list, in
// packages/contracts/src/fulfillments/fulfillments.ts; a column added to the
// table and named in the contract's patch becomes writable here with no edit,
// and one removed there stops being writable with no edit either.
export const PATCHABLE = Object.keys(
  FulfillmentPatch.shape
) as readonly (keyof FulfillmentPatch)[];

// order_id is ONE-WAY: a draft attaches to an order once, and a patch naming
// it is only ever that first attach, so it guards itself with WHERE order_id
// IS NULL - a second attach on an already-attached row changes nothing.
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
