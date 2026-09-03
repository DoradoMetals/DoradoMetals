// refiners.items, and nothing else.
//
// What the refinery reported for an order line: what came back once the scrap
// was melted, as against what the customer declared. One row per
// purchase-order line since 064, and every value is null until a refiner
// reports.
//
// ADMIN-ONLY. These are the assay actuals and a customer read must not carry
// them. The service decides - the two order reads differ by exactly whether
// they call this - and that is a better place for the decision than a boolean
// threaded through a projection.
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

// GET /orders/:orderId/refiners/items - every refiner row on one order,
// verbatim. See sql/get_for_order.sql for why this is its own read rather
// than three fields smeared onto the order's lines.
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
  // The first wins. The relationship is one-to-one since 064, so a second row
  // for one line is data that should not exist rather than a case to handle.
  for (const r of rows) if (!out.has(r.order_item_id)) out.set(r.order_item_id, r);
  return out;
}

// The refiner's own premium for a line. Ours lives on orders.items; theirs
// lives here - see sql/set_premium.sql for why the two were split.
// EVERY CUSTOMER LINE GETS ITS REFINER COUNTERPART - 093's mirror completion,
// applied to new traffic. Values stay NULL until the refiner reports (the
// shape 064 chose); bullion_id, metal_id and quantity ride over from the line;
// refiner_order_id links the row to the order's engagement. Idempotent: a line
// that already has its counterpart is left alone.
export async function mirrorLinesForOrder(
  order_id: string, executor?: Executor
): Promise<void> {
  await query(
    `INSERT INTO refiners.items (order_item_id, refiner_order_id, bullion_id, metal_id, quantity)
     SELECT oi.id, ro.id, oi.bullion_id, oi.metal_id, coalesce(oi.quantity, 1)
       FROM orders.items oi
       JOIN refiners.orders ro ON ro.order_id = oi.order_id
      WHERE oi.order_id = $1
        AND NOT EXISTS (SELECT 1 FROM refiners.items ri WHERE ri.order_item_id = oi.id)`,
    [order_id],
    executor
  );
}

// ONE UPDATE (D212's CRUD ruling): replaces setAssay and setPremium, which
// were the same UPDATE on the same table under two names. Keyed on
// order_item_id, the line's own id and the only key every caller holds - this
// table's own `id` never leaves it.
//
// content is COMPUTED BY THE CALLER (domain/orders/service.ts's
// updateScrapItem), never derived here - same rule set_assay.sql always had.
//
// THE KNOWN LIMIT IS FIXED. This header recorded that COALESCE($n, col) could
// not tell "leave this column alone" from "clear it to null", that every column
// here is nullable, and that a genuine clear was therefore unavailable. The
// statement is built from the keys the patch carries now (shared/db/patch.ts):
// omit a column and it is untouched, send it as null and it clears.
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
