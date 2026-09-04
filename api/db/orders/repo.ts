// orders.orders - CRUD only. One table, both directions; direction is a column.
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Direction } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";
import { columnsOf } from "#shared/db/columns.ts";
import { Order } from "@dorado/contracts";

const sql = sqlFrom(import.meta.dirname);


export async function exists(id: string, executor?: Executor): Promise<boolean> {
  const { rows } = await query<{ present: boolean }>(sql("exists"), [id], executor);
  return rows[0]?.present === true;
}

// THE COLUMN'S OWN TYPE, not `string`: the contract's `orders.enums.Direction` IS the
// orders.direction enum, which is what lets a caller pass the answer straight
// into a rule without a cast.
export async function directionOf(
  id: string, executor?: Executor
): Promise<Direction | null> {
  const { rows } = await query<{ direction: Direction }>(
    sql("direction_of"), [id], executor
  );
  return rows[0]?.direction ?? null;
}

// The direction of several orders at once.
export async function directionsById(
  ids: string[], executor?: Executor
): Promise<Map<string, Direction>> {
  if (ids.length === 0) return new Map();
  const { rows } = await query<{ id: string; direction: Direction }>(
    sql("directions"), [ids], executor
  );
  return new Map(rows.map((r) => [r.id, r.direction]));
}

// Both narrowings are optional and null means "every one": an admin asking for
// everything passes neither.
export async function list(
  { direction = null, user_id = null }: { direction?: string | null; user_id?: string | null },
  executor?: Executor
): Promise<Order[]> {
  const { rows } = await query<Order>(sql("list"), [direction, user_id], executor);
  return rows;
}

export async function getOne(
  id: string, executor?: Executor
): Promise<Order | undefined> {
  const { rows } = await query<Order>(sql("get_one"), [id], executor);
  return rows[0];
}

export async function ownerOf(id: string, executor?: Executor): Promise<string | null> {
  const { rows } = await query<{ user_id: string | null }>(sql("owner_of"), [id], executor);
  return rows[0]?.user_id ?? null;
}

export async function ownersById(
  ids: string[], executor?: Executor
): Promise<Map<string, string | null>> {
  if (ids.length === 0) return new Map();
  const { rows } = await query<{ id: string; user_id: string | null }>(
    sql("owners"), [ids], executor
  );
  return new Map(rows.map((r) => [r.id, r.user_id]));
}

// THE ONE WRITE. The guard is a row-state precondition evaluated IN THE
// STATEMENT, which makes the Pending-only transitions atomic under webhook
// retries: false means "nothing needed doing", never a stomped later status.
// THE COLUMNS, FROM THE CONTRACT (ruling 64): the row without its identity
// (id, user_id, direction, number) and without the audit columns the
// audit_stamp trigger writes. What a REQUEST may name is the narrower
// `OrderPatch` in @dorado/contracts, parsed strictly at the transport.
const WRITABLE = Order.omit({
  id: true, user_id: true, direction: true, number: true,
  created_by: true, updated_by: true, created_at: true, updated_at: true,
  created_by_id: true, updated_by_id: true,
});
export const PATCHABLE = columnsOf(WRITABLE);
export type OrderPatch = Partial<Record<(typeof PATCHABLE)[number], string | boolean | null>>;

// The two columns a caller may bind as a row-state precondition.
const GUARDABLE = columnsOf(Order.pick({ status: true, direction: true }));
export type OrderGuard = Partial<Record<(typeof GUARDABLE)[number], string>>;

export async function update(
  id: string, patch: OrderPatch, guard: OrderGuard = {}, executor?: Executor
): Promise<boolean> {
  const where: Record<string, unknown> = { id };
  for (const g of GUARDABLE) if (g in guard) where[g] = guard[g];
  const built = buildUpdate({
    table: "orders.orders",
    allowed: PATCHABLE,
    patch,
    where,
    casts: { direction: "orders.direction" },
    returning: "id",
  });
  if (!built) return true;
  const { rowCount } = await query(built.text, built.values, executor);
  return rowCount === 1;
}

// The sweeps' candidate reads and the reserved-credit read the cancel guards
// on. Each is a WHERE no other statement has.
export type SettledAwaiting = { order_id: string; payment_intent_id: string };
export async function findSalesAwaitingSettledIntent(
  executor?: Executor
): Promise<SettledAwaiting[]> {
  const { rows } = await query<SettledAwaiting>(
    sql("find_sales_awaiting_settled_intent"), [], executor);
  return rows;
}

export type AbandonedSale = {
  order_id: string; user_id: string | null;
  used_funds: boolean | null; reserved_funds: number | null;
  payment_intent_id: string | null; payment_status: string | null;
};
export async function findAbandonedSales(
  ttl_hours: number, executor?: Executor
): Promise<AbandonedSale[]> {
  const { rows } = await query<AbandonedSale>(
    sql("find_abandoned_sales"), [ttl_hours], executor);
  return rows;
}

export type ReservedFunds = {
  user_id: string | null; used_funds: boolean | null; reserved_funds: number | null;
};
export async function findReservedFunds(
  order_id: string, executor?: Executor
): Promise<ReservedFunds | undefined> {
  const { rows } = await query<ReservedFunds>(sql("find_reserved_funds"), [order_id], executor);
  return rows[0];
}

// `number` comes from the direction's own sequence inside the statement.
export type NewOrder = {
  id?: string | null;
  user_id: string | null;
  direction: "purchase" | "sale";
  status: string;
  notes?: string | null;
};

export async function create(
  row: NewOrder, executor?: Executor
): Promise<{ id: string; number: number }> {
  const { rows } = await query<{ id: string; number: number }>(
    sql("create"),
    [row.id ?? null, row.user_id, row.direction, row.status, row.notes ?? null],
    executor
  );
  return rows[0];
}
