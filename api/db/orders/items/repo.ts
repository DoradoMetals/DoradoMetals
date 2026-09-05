import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import { columnsOf, returningOf } from "#shared/db/columns.ts";
import { OrderItem, OrderItemWrite } from "@dorado/contracts";
import type { PricedLine, SoldLinePrice } from "@dorado/contracts";
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

export async function pricedLinesFor(
  order_id: string, executor?: Executor
): Promise<PricedLine[]> {
  const { rows } = await query<PricedLine>(sql("priced_lines"), [order_id], executor);
  return rows;
}

export async function create(
  order_id: string,
  row: OrderItemWrite & Pick<OrderItem, "metal_id">,
  executor?: Executor
): Promise<OrderItem> {
  const { rows } = await query<OrderItem>(
    sql("create"),
    [
      order_id, null, row.metal_id,
      row.pre_melt ?? null, row.post_melt ?? null, row.purity ?? null,
      row.content ?? null, row.premium ?? null, row.quantity ?? 1,
      row.confirmed ?? false, row.sales_tax_charged ?? 0,
      row.unit ?? null, row.price ?? null,
    ],
    executor
  );
  return rows[0];
}

export async function createBought(
  order_id: string, checkout_id: string, executor?: Executor
): Promise<OrderItem[]> {
  const { rows } = await query<OrderItem>(
    sql("create_bought"), [order_id, checkout_id], executor
  );
  return rows;
}

export async function createSold(
  order_id: string,
  checkout_id: string,
  priced: SoldLinePrice[],
  executor?: Executor
): Promise<OrderItem[]> {
  const { rows } = await query<OrderItem>(
    sql("create_sold"),
    [
      order_id, checkout_id,
      priced.map((p) => p.line_id), priced.map((p) => p.premium),
      priced.map((p) => p.sales_tax), priced.map((p) => p.price),
    ],
    executor
  );
  return rows;
}

export async function createFromProduct(
  order_id: string, bullion_id: string, executor?: Executor
): Promise<OrderItem | undefined> {
  const { rows } = await query<OrderItem>(
    sql("create_from_product"), [order_id, bullion_id], executor
  );
  return rows[0];
}

export const PATCHABLE = columnsOf(OrderItemWrite);
const RETURNING = returningOf(OrderItem);

export async function update(
  id: string,
  patch: OrderItemWrite,
  guard: Partial<Pick<OrderItem, "order_id">> = {},
  executor?: Executor
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

export async function remove(
  id: string, order_id: string, executor?: Executor
): Promise<boolean> {
  const { rowCount } = await query(sql("delete"), [order_id, id], executor);
  return rowCount === 1;
}
