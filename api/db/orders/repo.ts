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

export async function directionOf(
  id: string, executor?: Executor
): Promise<Direction | null> {
  const { rows } = await query<{ direction: Direction }>(
    sql("direction_of"), [id], executor
  );
  return rows[0]?.direction ?? null;
}

export async function directionsById(
  ids: string[], executor?: Executor
): Promise<Map<string, Direction>> {
  if (ids.length === 0) return new Map();
  const { rows } = await query<{ id: string; direction: Direction }>(
    sql("directions"), [ids], executor
  );
  return new Map(rows.map((r) => [r.id, r.direction]));
}

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

export async function createForCheckout(
  { checkout_id, status }: { checkout_id: string; status: string },
  executor?: Executor
): Promise<Order | undefined> {
  const { rows } = await query<Order>(
    sql("create_from_checkout"), [status, checkout_id], executor
  );
  return rows[0];
}
