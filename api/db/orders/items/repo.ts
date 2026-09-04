// orders.items - CRUD only. A line on an order, and for scrap the line IS the
// whole thing: pre_melt, post_melt, purity and content are columns here.
// bullion_id tells the two kinds apart - null means scrap.
import { randomUUID } from "node:crypto";
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import { columnsOf, returningOf } from "#shared/db/columns.ts";
import { OrderItem } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);


export async function getOne(
  id: string, executor?: Executor
): Promise<OrderItem | undefined> {
  const { rows } = await query<OrderItem>(sql("get_one"), [id], executor);
  return rows[0];
}

export async function getFor(
  order_id: string, executor?: Executor
): Promise<OrderItem[]> {
  const { rows } = await query<OrderItem>(sql("get_for"), [order_id], executor);
  return rows;
}

export async function getMany(
  order_ids: string[], executor?: Executor
): Promise<OrderItem[]> {
  if (order_ids.length === 0) return [];
  const { rows } = await query<OrderItem>(sql("get_many"), [order_ids], executor);
  return rows;
}

export async function getByIds(
  ids: string[], executor?: Executor
): Promise<OrderItem[]> {
  if (ids.length === 0) return [];
  const { rows } = await query<OrderItem>(sql("get_by_ids"), [ids], executor);
  return rows;
}

// EVERY line with its metal NAME - what premium re-tiering prices from. A
// purchase tiers bullion as well as scrap (Jacob, 2026-09-03), so bullion_id
// and quantity come back too: the first picks the band's percentage column,
// the second turns a bullion line's per-unit content into the metal it holds.
export type PricedLine = {
  id: string;
  metal: string | null;
  content: number | null;
  quantity: number | null;
  bullion_id: string | null;
};

export async function pricedLinesFor(
  order_id: string, executor?: Executor
): Promise<PricedLine[]> {
  const { rows } = await query<PricedLine>(sql("priced_lines"), [order_id], executor);
  return rows;
}

export type NewOrderItem = {
  id?: string;
  order_id: string;
  bullion_id?: string | null;
  metal_id?: string;
  pre_melt?: number | null;
  post_melt?: number | null;
  purity?: number | null;
  content?: number | null;
  premium?: number | null;
  quantity?: number | null;
  confirmed?: boolean;
  sales_tax_charged?: number;
  unit?: string | null;
  price?: number | null;
};

export async function create(row: NewOrderItem, executor?: Executor): Promise<OrderItem> {
  const { rows } = await query<OrderItem>(
    sql("create"),
    [
      row.id ?? randomUUID(), row.order_id, row.bullion_id ?? null, row.metal_id,
      row.pre_melt ?? null, row.post_melt ?? null, row.purity ?? null,
      row.content ?? null, row.premium ?? null, row.quantity ?? 1,
      row.confirmed ?? false, row.sales_tax_charged ?? 0,
      row.unit ?? null, row.price ?? null,
    ],
    executor
  );
  return rows[0];
}

// THE SIXTH VERB (D214 item 11): a derivation that yields N rows writes them in
// one call, so a use case carries no loop of its own.
export async function createMany(
  rows: NewOrderItem[], executor?: Executor
): Promise<OrderItem[]> {
  const written: OrderItem[] = [];
  for (const row of rows) written.push(await create(row, executor));
  return written;
}

// ONE UPDATE, and it answers THE WRITTEN ROW. `content` and `price` ARRIVE
// COMPUTED: the pricing and weight rules belong to domain/orders/rules.ts, not
// to a statement.
//
// THE COLUMNS, FROM THE CONTRACT (ruling 64). What a REQUEST may name is the
// narrower `OrderItemPatch`, parsed strictly at the transport. This is what the
// SERVICE may write: the row without its identity - the id, its order, and the
// two ids that say which kind of line it is - which leaves the derived columns
// (`content`, `price`) and `sales_tax_charged` writable, as they must be.
const WRITABLE = OrderItem.omit({
  id: true, order_id: true, bullion_id: true, metal_id: true,
});
export const PATCHABLE = columnsOf(WRITABLE);
const RETURNING = returningOf(OrderItem);

export type ItemPatch = Partial<Record<(typeof PATCHABLE)[number], string | number | boolean | null>>;
export type ItemGuard = { order_id?: string };

export async function update(
  id: string, patch: ItemPatch, guard: ItemGuard = {}, executor?: Executor
): Promise<OrderItem | undefined> {
  const where: Record<string, unknown> = { id };
  if (guard.order_id) where.order_id = guard.order_id;
  const built = buildUpdate({
    table: "orders.items", allowed: PATCHABLE, patch, where, returning: RETURNING,
  });
  if (!built) return await getOne(id, executor);
  const { rows } = await query<OrderItem>(built.text, built.values, executor);
  return rows[0];
}

// THE ORDER ID IS REQUIRED, not optional - see sql/delete.sql.
export async function remove(
  id: string, order_id: string, executor?: Executor
): Promise<boolean> {
  const { rowCount } = await query(sql("delete"), [order_id, id], executor);
  return rowCount === 1;
}
