// orders.orders, and nothing else.
//
// TWO QUESTIONS, AND THAT IS ALL THIS ANSWERS SO FAR. Purchase orders and sales
// orders have not been restructured yet and still read through their own
// repos; this exists because features/fulfillments needs to ask about an order
// without reaching into its table, and a read of orders.orders belongs to
// orders rather than to whoever wanted it.
//
// It grows when purchase-orders and sales-orders are restructured. It is
// deliberately not a stub for that work - both of these are real reads with
// real callers today.
import query from "#shared/db/query.js";
import { sqlFrom } from "#shared/db/sql.ts";
import type { orders } from "@dorado/contracts";
import type { PoolClient } from "pg";

const sql = sqlFrom(import.meta.dirname);

export type Executor = PoolClient | undefined;

// THE THREE WORKFLOW FLAGS, AS A CLOSED SET. sql/set_flag.sql interpolates a
// column name, which is safe only because it can be one of exactly these three
// - nothing derived from a request can reach the substitution.
export const FLAGS = {
  order_sent: "order_sent",
  tracking_updated: "tracking_updated",
  review_created: "review_created",
} as const;

export type Flag = keyof typeof FLAGS;

// Whether an order is in the new schema at all. orders.orders is populated by
// backfill and kept current by the orders dual-write, so an order that exists
// only in exchange has no row here.
export async function exists(id: string, executor?: Executor): Promise<boolean> {
  const { rows } = await query<{ present: boolean }>(sql("exists"), [id], executor);
  return rows[0]?.present === true;
}

// The direction of several orders at once. Hop THREE of putting an order id
// back onto a shipment - see sql/directions.sql.
export async function directionsById(
  ids: string[], executor?: Executor
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { rows } = await query<{ id: string; direction: string }>(
    sql("directions"), [ids], executor
  );
  return new Map(rows.map((r) => [r.id, r.direction]));
}

// THE ORDER ROWS THEMSELVES, VERBATIM (wave 3). One statement for both
// directions, because orders.orders is one table with a `direction` column -
// the per-direction read services compose an order for the API's OWN
// lifecycle work (pricing, emails, PDFs) and are no longer a wire shape.
//
// Both narrowings are optional and passed as null to mean "every one": a
// direction, and an owner. An admin asking for everything passes neither.
export type OrderRow = orders.OrdersRow;

export async function list(
  { direction = null, user_id = null }: { direction?: string | null; user_id?: string | null },
  executor?: Executor
): Promise<OrderRow[]> {
  const { rows } = await query<OrderRow>(sql("list"), [direction, user_id], executor);
  return rows;
}

export async function getOne(
  id: string, executor?: Executor
): Promise<OrderRow | undefined> {
  const { rows } = await query<OrderRow>(sql("get_one"), [id], executor);
  return rows[0];
}

export async function ownerOf(id: string, executor?: Executor): Promise<string | null> {
  const { rows } = await query<{ user_id: string | null }>(sql("owner_of"), [id], executor);
  return rows[0]?.user_id ?? null;
}

// THE WRITES, for both directions.
//
// orders.orders is one table where exchange had two, so it gets one statement
// each rather than one per direction. sales-orders currently carries its own
// identical copies - see D42; they converge here rather than here becoming a
// third writer.
export async function setStatus(
  id: string, status: string | null, by: string | null, executor?: Executor
): Promise<string | undefined> {
  const { rows } = await query<{ id: string }>(sql("set_status"), [status, by, id], executor);
  return rows[0]?.id;
}

// exchange's createReview was this with `review_created` hard-coded.
export async function setFlag(
  id: string, flag: Flag, executor?: Executor
): Promise<string | undefined> {
  const { rows } = await query<{ id: string }>(
    sql("set_flag").replaceAll("__COLUMN__", FLAGS[flag]), [id], executor
  );
  return rows[0]?.id;
}
