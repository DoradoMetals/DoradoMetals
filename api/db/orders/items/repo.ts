// orders.items - CRUD only. A line on an order, and for scrap the line IS the
// whole thing: pre_melt, post_melt, purity and content are columns here.
// bullion_id tells the two kinds apart - null means scrap.
import { randomUUID } from "node:crypto";
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import { columnsOf, returningOf } from "#shared/db/columns.ts";
import { OrderItem, OrderItemWrite } from "@dorado/contracts";
import type { PricedLine } from "@dorado/contracts";
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

// EVERY line with its metal NAME - what premium re-tiering prices from
// (`PricedLine` in @dorado/contracts).
export async function pricedLinesFor(
  order_id: string, executor?: Executor
): Promise<PricedLine[]> {
  const { rows } = await query<PricedLine>(sql("priced_lines"), [order_id], executor);
  return rows;
}

// A DECLARED LOT. The one create that is not a copy: an admin types the weight
// and the unit, and `content` is derived from them before it gets here.
export async function create(
  order_id: string,
  row: OrderItemWrite & Pick<OrderItem, "metal_id">,
  executor?: Executor
): Promise<OrderItem> {
  const { rows } = await query<OrderItem>(
    sql("create"),
    [
      randomUUID(), order_id, null, row.metal_id,
      row.pre_melt ?? null, row.post_melt ?? null, row.purity ?? null,
      row.content ?? null, row.premium ?? null, row.quantity ?? 1,
      row.confirmed ?? false, row.sales_tax_charged ?? 0,
      row.unit ?? null, row.price ?? null,
    ],
    executor
  );
  return rows[0];
}

// THE LINES A BASKET BECAME, copied by the statement (ruling 66) - one call
// per direction rather than a rule that maps every column into a row literal
// and a loop that inserts them one at a time.
export async function createBought(
  order_id: string, checkout_id: string, executor?: Executor
): Promise<OrderItem[]> {
  const { rows } = await query<OrderItem>(
    sql("create_bought"), [order_id, checkout_id], executor
  );
  return rows;
}

// The same copy, joined to what the sale PRICING decided per line - keyed by
// the checkout line's id, so a line nothing priced does not join and the
// caller sees a short answer rather than a line priced at zero.
export async function createSold(
  order_id: string,
  checkout_id: string,
  priced: { line_id: string; premium: number; sales_tax: number; price: number }[],
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

// A CATALOGUE LINE, copied from the product itself.
export async function createFromProduct(
  order_id: string, bullion_id: string, executor?: Executor
): Promise<OrderItem | undefined> {
  const { rows } = await query<OrderItem>(
    sql("create_from_product"), [order_id, bullion_id], executor
  );
  return rows[0];
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

// THE ORDER ID IS REQUIRED, not optional - see sql/delete.sql.
export async function remove(
  id: string, order_id: string, executor?: Executor
): Promise<boolean> {
  const { rowCount } = await query(sql("delete"), [order_id, id], executor);
  return rowCount === 1;
}
