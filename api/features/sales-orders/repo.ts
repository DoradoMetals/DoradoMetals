// The sale direction of orders.orders, and the rows that hang off it.
//
// NOT one table, and that is the one place this feature departs from the
// pattern. A sales order's own row, its money, its lines, its address link and
// its quoted spots are five tables that are only ever written TOGETHER, in one
// transaction, from one payload - so splitting them into five write-only repos
// would be five files that no caller can use independently and one service
// calling all five in a fixed order anyway.
//
// The READS are already split properly: orders/transactions, orders/items,
// orders/addresses and orders/spots each own their table and are shared with
// purchase orders. This file is the write half, and it writes through those
// tables' own statements.
import query from "#shared/db/query.js";
import { sqlFrom } from "#shared/db/sql.ts";
import type { PoolClient } from "pg";

const sql = sqlFrom(import.meta.dirname);

export type Executor = PoolClient | undefined;

// THE STATUS AND THE THREE FLAGS COME FROM features/orders (D42).
//
// Both write orders.orders, which features/orders owns, and this file used to
// carry its own byte-identical copies of the statement and the closed flag set.
// Two copies of one statement is a divergence waiting to happen: whichever is
// edited first is right until someone notices. Re-exported rather than
// re-implemented, so the call sites here are unchanged.
export { FLAGS, setFlag, setStatus } from "#features/orders/repo.ts";
export type { Flag } from "#features/orders/repo.ts";

// `number` comes from EXCHANGE's sequence - see sql/create.sql.
export async function createOrder(
  id: string, user_id: string | null, status: string | null,
  by: string | null, executor?: Executor
): Promise<{ id: string; number: number }> {
  const { rows } = await query<{ id: string; number: number }>(
    sql("create"), [id, user_id, status, by], executor
  );
  return rows[0];
}

// The twelve money values, in sql/create_totals.sql's order. The five renames
// from exchange's names are stated in that file.
export type TotalsValues = [
  number | null, number | null, string | null, number | null,
  number | null, number | null, boolean | null,
  number | null, number | null, number | null, number | null,
];

export async function createTotals(
  id: string, order_id: string, values: TotalsValues, by: string | null, executor?: Executor
): Promise<void> {
  await query(sql("create_totals"), [id, order_id, ...values, by], executor);
}

export async function createItem(
  id: string, order_id: string, bullion_id: string | null, metal_id: string,
  price: number | null, quantity: number | null, premium: number | null,
  sales_tax_charged: number | null, executor?: Executor
): Promise<void> {
  await query(
    sql("create_item"),
    [id, order_id, bullion_id, metal_id, price, quantity, premium, sales_tax_charged ?? 0],
    executor
  );
}

export async function createAddress(
  id: string, order_id: string, address_id: string, source_address_id: string | null,
  executor?: Executor
): Promise<void> {
  await query(sql("create_address"), [id, order_id, address_id, source_address_id], executor);
}

export async function createSpot(
  id: string, order_id: string, metal_id: string,
  ask: number | null, bid: number | null, executor?: Executor
): Promise<void> {
  await query(sql("create_spot"), [id, order_id, metal_id, ask, bid], executor);
}

export async function setRefinery(
  id: string, refinery_id: string | null, executor?: Executor
): Promise<{ id: string; supplier_id: string | null } | undefined> {
  const { rows } = await query<{ id: string; supplier_id: string | null }>(
    sql("set_refinery"), [refinery_id, id], executor
  );
  return rows[0];
}
