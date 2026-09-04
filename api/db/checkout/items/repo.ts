import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Executor } from "#shared/db/executor.ts";
import { columnsOf } from "#shared/db/columns.ts";
import { CheckoutItem, CheckoutItemWrite } from "@dorado/contracts";
import type { OrderLine } from "@dorado/contracts";

const sql = sqlFrom(import.meta.dirname);

export const PATCHABLE = columnsOf(CheckoutItemWrite)
  .filter((column) => column !== "checkout_id");

export async function getOne(id: string, executor?: Executor): Promise<CheckoutItem | undefined> {
  const { rows } = await query<CheckoutItem>(sql("get_one"), [id], executor);
  return rows[0];
}

export async function listFor(checkout_id: string, executor?: Executor): Promise<CheckoutItem[]> {
  const { rows } = await query<CheckoutItem>(sql("list_for_checkout"), [checkout_id], executor);
  return rows;
}

export async function listForOrder(
  checkout_id: string, executor?: Executor
): Promise<OrderLine[]> {
  const { rows } = await query<OrderLine>(sql("list_for_order"), [checkout_id], executor);
  return rows;
}

export async function create(row: CheckoutItemWrite, executor?: Executor): Promise<CheckoutItem> {
  const { rows } = await query<CheckoutItem>(
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
  rows: CheckoutItemWrite[], executor?: Executor
): Promise<CheckoutItem[]> {
  const written: CheckoutItem[] = [];
  for (const row of rows) written.push(await create(row, executor));
  return written;
}

export async function update(
  id: string, patch: Omit<CheckoutItemWrite, "checkout_id">, executor?: Executor
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

export async function reassign(
  from_checkout_id: string, to_checkout_id: string, executor?: Executor
): Promise<number> {
  const { rowCount } = await query(
    sql("reassign"), [from_checkout_id, to_checkout_id], executor
  );
  return rowCount ?? 0;
}

export async function removeFor(checkout_id: string, executor?: Executor): Promise<number> {
  const { rowCount } = await query(sql("delete_for_checkout"), [checkout_id], executor);
  return rowCount ?? 0;
}
