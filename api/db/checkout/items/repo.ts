// checkout.items, and nothing else.
//
// SCRAP AND BULLION ARE ONE TABLE. exchange put a piece of scrap in
// exchange.scrap and pointed a sell_cart_item at it; here the values sit on the
// line and `bullion_id IS NULL` is what makes it scrap - the same shape
// orders.items and refiners.items use. A line is its own record.
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { CheckoutItem } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type ItemRow = CheckoutItem;

export const PATCHABLE = [
  "bullion_id", "metal_id", "pre_melt", "post_melt", "purity",
  "content", "unit", "premium", "quantity",
] as const;

// The lines as order creation needs them - see sql/list_for_order.sql.
export type OrderLine = Pick<
  ItemRow,
  | "id" | "bullion_id" | "metal_id" | "pre_melt" | "post_melt" | "purity"
  | "content" | "unit" | "premium" | "quantity"
>;

// A line as create.sql binds it: the session it belongs to, plus the nine
// value columns. Derived from the row rather than restated - `content` and
// `premium` are on it because the SERVER computes both (rules.ts), which is
// exactly why CheckoutItemPatch (the request shape) does not carry them.
export type NewItem = Pick<CheckoutItem, "checkout_id"> &
  Partial<Pick<CheckoutItem, (typeof PATCHABLE)[number]>>;

export type ItemPatch = Partial<Pick<ItemRow, (typeof PATCHABLE)[number]>>;

export async function getOne(id: string, executor?: Executor): Promise<ItemRow | undefined> {
  const { rows } = await query<ItemRow>(sql("get_one"), [id], executor);
  return rows[0];
}

export async function listFor(checkout_id: string, executor?: Executor): Promise<ItemRow[]> {
  const { rows } = await query<ItemRow>(sql("list_for_checkout"), [checkout_id], executor);
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

export async function createMany(
  rows: NewItem[], executor?: Executor
): Promise<ItemRow[]> {
  const written: ItemRow[] = [];
  for (const row of rows) written.push(await create(row, executor));
  return written;
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

// A VISITOR'S BASKET CHANGES HANDS with the customer's surviving row (ruling
// 63). Answers how many lines moved. Not a patch: checkout_id is the line's
// PARENT, and PATCHABLE is what a request may name.
export async function reassign(
  from_checkout_id: string, to_checkout_id: string, executor?: Executor
): Promise<number> {
  const { rowCount } = await query(
    sql("reassign"), [from_checkout_id, to_checkout_id], executor
  );
  return rowCount ?? 0;
}

// The sync REPLACES a basket rather than merging it, so every write empties the
// session first. Answers how many lines went.
export async function removeFor(checkout_id: string, executor?: Executor): Promise<number> {
  const { rowCount } = await query(sql("delete_for_checkout"), [checkout_id], executor);
  return rowCount ?? 0;
}
