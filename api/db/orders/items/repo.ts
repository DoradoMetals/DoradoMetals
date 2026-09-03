// orders.items - CRUD only. A line on an order, and for scrap the line IS the
// whole thing: pre_melt, post_melt, purity and content are columns here.
// bullion_id tells the two kinds apart - null means scrap.
import { randomUUID } from "node:crypto";
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { orders } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type OrderItemRow = orders.ItemsRow;

export async function getOne(
  id: string, executor?: Executor
): Promise<OrderItemRow | undefined> {
  const { rows } = await query<OrderItemRow>(sql("get_one"), [id], executor);
  return rows[0];
}

export async function getFor(
  order_id: string, executor?: Executor
): Promise<OrderItemRow[]> {
  const { rows } = await query<OrderItemRow>(sql("get_for"), [order_id], executor);
  return rows;
}

export async function getMany(
  order_ids: string[], executor?: Executor
): Promise<OrderItemRow[]> {
  if (order_ids.length === 0) return [];
  const { rows } = await query<OrderItemRow>(sql("get_many"), [order_ids], executor);
  return rows;
}

export async function getByIds(
  ids: string[], executor?: Executor
): Promise<OrderItemRow[]> {
  if (ids.length === 0) return [];
  const { rows } = await query<OrderItemRow>(sql("get_by_ids"), [ids], executor);
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
  metal_id: string;
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

export async function create(row: NewOrderItem, executor?: Executor): Promise<OrderItemRow> {
  const { rows } = await query<OrderItemRow>(
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

// ONE UPDATE. `content` and `price` ARRIVE COMPUTED: the pricing and weight
// rules belong to domain/orders/rules.ts, not to a statement.
export const PATCHABLE = [
  "pre_melt", "post_melt", "purity", "content",
  "premium", "quantity", "confirmed", "price", "unit",
] as const;
type ItemColumn = (typeof PATCHABLE)[number];
export type ItemPatch = Partial<Record<ItemColumn, string | number | boolean | null>>;
export type ItemGuard = { order_id?: string };

export async function update(
  id: string, patch: ItemPatch, guard: ItemGuard = {}, executor?: Executor
): Promise<boolean> {
  const where: Record<string, unknown> = { id };
  if (guard.order_id) where.order_id = guard.order_id;
  const built = buildUpdate({
    table: "orders.items", allowed: PATCHABLE, patch, where, returning: "id",
  });
  if (!built) return true;
  const { rowCount } = await query(built.text, built.values, executor);
  return rowCount === 1;
}

// THE ORDER ID IS REQUIRED, not optional - see sql/delete.sql.
export async function remove(
  id: string, order_id: string, executor?: Executor
): Promise<boolean> {
  const { rowCount } = await query(sql("delete"), [order_id, id], executor);
  return rowCount === 1;
}
