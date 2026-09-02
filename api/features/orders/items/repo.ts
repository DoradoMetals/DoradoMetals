// orders.items, and nothing else.
//
// A LINE ON AN ORDER, AND FOR SCRAP THE LINE IS THE WHOLE THING.
// exchange.scrap does not exist in this schema: pre_melt, post_melt, purity and
// content are columns here, because a scrap row was never an entity anyone
// referred to. That is why features/scrap has no table to migrate - its repo is
// deleted rather than converted, and its three functions become part of this
// write path.
//
// bullion_id is what tells the two kinds apart: null means scrap.
import { randomUUID } from "node:crypto";
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { orders } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type OrderItemRow = orders.ItemsRow;

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

// THE ROW, not a positional tuple (Jacob, 2026-09-01: a repo write takes the
// resource itself). The repo maps named fields onto the statement's parameter
// order in exactly one place - here.
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

// The weights of a scrap line. `content` is computed by the caller - see
// sql/update_scrap.sql for why it is not computed here.
export async function updateScrap(
  id: string,
  s: {
    pre_melt: number | null; post_melt: number | null;
    purity: number | null; content: number | null;
  },
  executor?: Executor
): Promise<OrderItemRow | undefined> {
  const { rows } = await query<OrderItemRow>(
    sql("update_scrap"),
    [s.pre_melt, s.post_melt, s.purity, s.content, id],
    executor
  );
  return rows[0];
}

// THE SCRAP GOES WITH THE LINE, because the scrap IS the line. In exchange this
// was two deletes that could come apart.
// THE ORDER ID IS REQUIRED, not optional.
//
// exchange deleted order lines on ids alone, and so did this until now - see
// sql/delete.sql for what that costs. Making it a parameter rather than an
// option is the point: a caller cannot forget the guard, because there is no
// signature that omits it. `remove` had no callers at all, so nothing had to
// bend to accommodate the change.
export async function removeFromOrder(
  order_id: string, ids: string[], executor?: Executor
): Promise<string[]> {
  if (ids.length === 0) return [];
  const { rows } = await query<{ id: string }>(sql("delete"), [order_id, ids], executor);
  return rows.map((r) => r.id);
}

// THE PRICE ARRIVES COMPUTED - see sql/set_price.sql. exchange worked it out
// inside the repo from the spot rows, which put the pricing rules a layer below
// the service that owns them.
export async function setPrice(
  id: string, order_id: string, price: number | null, executor?: Executor
): Promise<{ id: string; order_id: string; price: number | null } | undefined> {
  const { rows } = await query<{ id: string; order_id: string; price: number | null }>(
    sql("set_price"), [price, id, order_id], executor
  );
  return rows[0];
}

export async function clearPrices(
  order_id: string, executor?: Executor
): Promise<string[]> {
  const { rows } = await query<{ id: string }>(sql("clear_prices"), [order_id], executor);
  return rows.map((r) => r.id);
}

export async function setConfirmed(
  order_id: string, ids: string[], confirmed: boolean, executor?: Executor
): Promise<string[]> {
  if (ids.length === 0) return [];
  const { rows } = await query<{ id: string }>(
    sql("set_confirmed"), [confirmed, order_id, ids], executor
  );
  return rows.map((r) => r.id);
}

export async function setBullion(
  id: string, quantity: number | null, premium: number | null, executor?: Executor
): Promise<{ id: string; order_id: string } | undefined> {
  const { rows } = await query<{ id: string; order_id: string }>(
    sql("set_bullion"), [quantity, premium, id], executor
  );
  return rows[0];
}

export type ScrapLine = { id: string; metal: string | null; content: number | null };

export async function scrapLinesFor(
  order_id: string, executor?: Executor
): Promise<ScrapLine[]> {
  const { rows } = await query<ScrapLine>(sql("scrap_lines"), [order_id], executor);
  return rows;
}

export async function setPremium(
  id: string, premium: number | null, executor?: Executor
): Promise<{ id: string; order_id: string } | undefined> {
  const { rows } = await query<{ id: string; order_id: string }>(
    sql("set_premium"), [premium, id], executor
  );
  return rows[0];
}
