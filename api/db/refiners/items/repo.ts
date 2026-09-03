// refiners.items, and nothing else - the refiner's counterpart to a customer
// line: what came back once scrap was melted against what the customer
// declared. One row per line, null until a refiner reports.
// ADMIN-ONLY: these are assay actuals and a customer read must not carry them.
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { refiners } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type RefinerItemRow = refiners.ItemsRow;

export async function getForItems(
  order_item_ids: string[], executor?: Executor
): Promise<RefinerItemRow[]> {
  if (order_item_ids.length === 0) return [];
  const { rows } = await query<RefinerItemRow>(
    sql("get_for_items"), [order_item_ids], executor
  );
  return rows;
}

// GET /orders/:orderId/refiners/items — every refiner row on one order, verbatim; see sql/get_for_order.sql for why this stays its own read.
export async function getForOrder(
  order_id: string, executor?: Executor
): Promise<RefinerItemRow[]> {
  const { rows } = await query<RefinerItemRow>(sql("get_for_order"), [order_id], executor);
  return rows;
}

// By the line they belong to, for composing without a query per line.
export async function byOrderItem(
  order_item_ids: string[], executor?: Executor
): Promise<Map<string, RefinerItemRow>> {
  const rows = await getForItems(order_item_ids, executor);
  const out = new Map<string, RefinerItemRow>();
  // The first wins — the relationship is one-to-one, so a second row for one line is data that should not exist rather than a case to handle.
  for (const r of rows) if (!out.has(r.order_item_id)) out.set(r.order_item_id, r);
  return out;
}

// The refiner counterpart of one customer line. Values stay NULL until the
// refinery reports; the rule that builds the row decides what rides over.
export type NewRefinerItem = Pick<
  RefinerItemRow,
  "order_item_id" | "refiner_order_id" | "bullion_id" | "metal_id" | "quantity"
>;

export async function create(
  row: NewRefinerItem, executor?: Executor
): Promise<RefinerItemRow> {
  const { rows } = await query<RefinerItemRow>(
    `INSERT INTO refiners.items
       (order_item_id, refiner_order_id, bullion_id, metal_id, quantity)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, order_item_id, refiner_id, bullion_id, metal_id,
               pre_melt, post_melt, purity, content, premium, quantity, unit,
               refiner_order_id`,
    [row.order_item_id, row.refiner_order_id, row.bullion_id, row.metal_id, row.quantity],
    executor
  );
  return rows[0];
}

// THE SIXTH VERB (D214 item 11): a derivation that yields N rows writes them in
// one call, so the use case carries no loop of its own.
export async function createMany(
  rows: NewRefinerItem[], executor?: Executor
): Promise<RefinerItemRow[]> {
  const written: RefinerItemRow[] = [];
  for (const row of rows) written.push(await create(row, executor));
  return written;
}

// Keyed on order_item_id — the line's own id and the only key every caller holds; this table's own `id` never leaves it.
// content is computed by the caller (domain/orders/service.ts), never derived here; omit a column to leave it untouched, send null to clear it (shared/db/patch.ts).
export const PATCHABLE = [
  "pre_melt", "post_melt", "purity", "content", "premium", "unit",
] as const;

export type ItemPatch = Partial<Pick<RefinerItemRow, (typeof PATCHABLE)[number]>>;

export async function update(
  order_item_id: string, patch: ItemPatch, executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({
    table: "refiners.items", allowed: PATCHABLE, patch, where: { order_item_id },
  });
  if (!built) return true;
  const { rowCount } = await query(built.text, built.values, executor);
  return rowCount === 1;
}
