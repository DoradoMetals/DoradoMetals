// orders.orders - CRUD only. One table, both directions; direction is a column.
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type {
  AbandonedSale, Direction, OrderGuard, OrderWrite, ReservedFunds, SettledAwaiting,
} from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";
import { columnsOf } from "#shared/db/columns.ts";
import { Order, OrderGuard as Guard, OrderWrite as Write } from "@dorado/contracts";

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
// THE COLUMNS, FROM THE CONTRACT (ruling 64): `OrderWrite` is the row without
// its identity and without the audit columns the audit_stamp trigger writes.
// What a REQUEST may name is the narrower `OrderPatch`, parsed strictly at the
// transport.
export const PATCHABLE = columnsOf(Write);
const GUARDABLE = columnsOf(Guard);

export async function update(
  id: string, patch: OrderWrite, guard: OrderGuard = {}, executor?: Executor
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
// on. Each is a WHERE no other statement has; the shapes are contracts
// (computed/orders.ts) because no single table backs a three-way join.
export async function findSalesAwaitingSettledIntent(
  executor?: Executor
): Promise<SettledAwaiting[]> {
  const { rows } = await query<SettledAwaiting>(
    sql("find_sales_awaiting_settled_intent"), [], executor);
  return rows;
}

export async function findAbandonedSales(
  ttl_hours: number, executor?: Executor
): Promise<AbandonedSale[]> {
  const { rows } = await query<AbandonedSale>(
    sql("find_abandoned_sales"), [ttl_hours], executor);
  return rows;
}

export async function findReservedFunds(
  order_id: string, executor?: Executor
): Promise<ReservedFunds | undefined> {
  const { rows } = await query<ReservedFunds>(sql("find_reserved_funds"), [order_id], executor);
  return rows[0];
}

// THE ORDER A CHECKOUT BECAME. The owner and the direction are COPIED from
// the checkout row by the statement (ruling 66), so nothing assembles a row
// literal out of them first; `number` comes from that direction's own
// sequence, inside the same statement.
export async function createForCheckout(
  { id, checkout_id, status }: { id?: string | null; checkout_id: string; status: string },
  executor?: Executor
): Promise<Order | undefined> {
  const { rows } = await query<Order>(
    sql("create_from_checkout"), [id ?? null, status, checkout_id], executor
  );
  return rows[0];
}
