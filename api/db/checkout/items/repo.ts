// checkout.items, and nothing else.
//
// SCRAP AND BULLION ARE ONE TABLE. exchange put a piece of scrap in
// exchange.scrap and pointed a sell_cart_item at it; here the values sit on the
// line and `bullion_id IS NULL` is what makes it scrap - the same shape
// orders.items and refiners.items use. A line is its own record.
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { checkout, products } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type ItemRow = checkout.ItemsRow;

// A product column reached through a LEFT JOIN is null when the product was
// deleted, so the mapped type says that once instead of twenty times.
type Nullable<T> = { [K in keyof T]: T[K] | null };

type LineKey = {
  cart_item_id: ItemRow["id"];
  product_id: ItemRow["bullion_id"];
  quantity: ItemRow["quantity"];
};

// The two frozen wire shapes for a bullion line. They differ by projection, not
// by rule: the sell cart has never carried the tender flags or the mint, and a
// schema migration never changes a wire shape.
export type SaleBullionLine = Nullable<
  Pick<
    products.BullionRow,
    | "id" | "gross" | "purity" | "content" | "slug" | "bid_premium"
    | "ask_premium" | "image_front" | "image_back" | "shadow_offset"
    | "variant_group" | "variant_label" | "is_generic" | "legal_tender"
    | "domestic_tender" | "sell_display"
  >
> &
  LineKey & {
    product_name: string | null;
    product_description: string | null;
    product_type: string | null;
    metal_type: string | null;
    mint_name: string | null;
  };

export type PurchaseBullionLine = Nullable<
  Pick<
    products.BullionRow,
    | "id" | "gross" | "purity" | "content" | "slug" | "bid_premium"
    | "ask_premium" | "image_front" | "image_back" | "shadow_offset"
    | "variant_group" | "variant_label"
  >
> &
  LineKey & {
    product_name: string | null;
    product_description: string | null;
    product_type: string | null;
    metal_type: string | null;
  };

// A scrap line. `scrap_id` and `id` are both the line's own id - see
// sql/list_scrap.sql.
export type ScrapLine = Pick<
  ItemRow, "id" | "quantity" | "pre_melt" | "post_melt" | "purity" | "content"
> & {
  cart_item_id: ItemRow["id"];
  scrap_id: ItemRow["id"];
  gross_unit: ItemRow["unit"];
  bid_premium: ItemRow["premium"];
  metal: string | null;
};

// The lines as order creation needs them - see sql/list_for_order.sql.
export type OrderLine = Pick<
  ItemRow,
  | "id" | "bullion_id" | "metal_id" | "pre_melt" | "post_melt" | "purity"
  | "content" | "unit" | "premium" | "quantity"
>;

// metal_id and premium ARRIVE RESOLVED: the service reads the product (or the
// metal by name) and passes ids, so this write touches one table.
export type NewItem = {
  checkout_id: string;
  bullion_id: string | null;
  metal_id: string | null;
  pre_melt?: number | null;
  post_melt?: number | null;
  purity?: number | null;
  content?: number | null;
  unit?: string | null;
  premium?: number | null;
  quantity?: number | null;
};

export const PATCHABLE = [
  "bullion_id", "metal_id", "pre_melt", "post_melt", "purity",
  "content", "unit", "premium", "quantity",
] as const;

export type ItemPatch = Partial<Pick<ItemRow, (typeof PATCHABLE)[number]>>;

export async function getOne(id: string, executor?: Executor): Promise<ItemRow | undefined> {
  const { rows } = await query<ItemRow>(sql("get_one"), [id], executor);
  return rows[0];
}

export async function listFor(checkout_id: string, executor?: Executor): Promise<ItemRow[]> {
  const { rows } = await query<ItemRow>(sql("list_for_checkout"), [checkout_id], executor);
  return rows;
}

// ONE FUNCTION, DIRECTION AS DATA. The overloads exist because the two
// statements answer two frozen wire shapes, not because there are two rules.
export function listBullionFor(
  checkout_id: string, direction: "sale", executor?: Executor
): Promise<SaleBullionLine[]>;
export function listBullionFor(
  checkout_id: string, direction: "purchase", executor?: Executor
): Promise<PurchaseBullionLine[]>;
export async function listBullionFor(
  checkout_id: string, direction: string, executor?: Executor
): Promise<SaleBullionLine[] | PurchaseBullionLine[]> {
  const statement = direction === "sale" ? "list_bullion_sale" : "list_bullion_purchase";
  const { rows } = await query<SaleBullionLine>(sql(statement), [checkout_id], executor);
  return rows;
}

export async function listScrapFor(
  checkout_id: string, executor?: Executor
): Promise<ScrapLine[]> {
  const { rows } = await query<ScrapLine>(sql("list_scrap"), [checkout_id], executor);
  return rows;
}

export async function listForOrder(
  checkout_id: string, executor?: Executor
): Promise<OrderLine[]> {
  const { rows } = await query<OrderLine>(sql("list_for_order"), [checkout_id], executor);
  return rows;
}

export async function create(row: NewItem, executor?: Executor): Promise<ItemRow> {
  const { rows } = await query<ItemRow>(
    sql("create"),
    [
      row.checkout_id, row.bullion_id, row.metal_id, row.pre_melt, row.post_melt,
      row.purity, row.content, row.unit, row.premium, row.quantity,
    ],
    executor
  );
  return rows[0];
}

export async function update(
  id: string, patch: ItemPatch, executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({
    table: "checkout.items", allowed: PATCHABLE, patch, where: { id },
  });
  if (!built) return true;
  const { rowCount } = await query(built.text, built.values, executor);
  return rowCount === 1;
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql("delete"), [id], executor);
  return rowCount === 1;
}

// The sync REPLACES a basket rather than merging it, so every write empties the
// session first. Answers how many lines went.
export async function removeFor(checkout_id: string, executor?: Executor): Promise<number> {
  const { rowCount } = await query(sql("delete_for_checkout"), [checkout_id], executor);
  return rowCount ?? 0;
}
