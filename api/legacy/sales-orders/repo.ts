// exchange.sales_orders and its two children. THIS FILE IS SCHEDULED FOR
// DELETION.
//
// exchange keeps the money on the order's own row where the new schema has
// orders.transactions, and keys a quoted spot by metal NAME where the new
// schema uses a metal id. Both mappings are stated once - here and in the
// matching sql/ file - so the two halves of a dual write cannot drift apart
// silently.
import query from "#shared/db/query.js";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

// The fourteen values exchange.sales_orders takes after the id, in its order.
export type LegacyOrderValues = [
  string | null, string | null, string | null,
  number | null, string | null, number | null,
  number | null, number | null, number | null, boolean | null,
  number | null, number | null, number | null, number | null,
];

// `order_number` is the number sql/create.sql already drew for orders.orders -
// passed through so exchange's column DEFAULT never draws the sequence again.
export async function createOrder(
  id: string, values: LegacyOrderValues, order_number: number, executor?: Executor
): Promise<void> {
  await query(sql("create"), [id, ...values, order_number], executor);
}

export async function createItem(
  id: string, order_id: string, product_id: string | null,
  price: number | null, quantity: number | null, premium: number | null,
  sales_tax_rate: number | null, executor?: Executor
): Promise<void> {
  await query(
    sql("create_item"),
    [id, order_id, product_id, price, quantity, premium, sales_tax_rate],
    executor
  );
}

// KEYED BY METAL NAME, not by id - that is exchange's shape and the reason this
// takes a `type` where the new-schema statement takes a metal_id.
export async function createSpot(
  order_id: string, type: string | null, ask_spot: number | null, executor?: Executor
): Promise<void> {
  await query(sql("create_spot"), [order_id, type, ask_spot], executor);
}

export async function setStatus(
  id: string, status: string | null, by: string | null, executor?: Executor
): Promise<void> {
  await query(sql("set_status"), [status, by, id], executor);
}

// The three workflow flags. The column name is substituted from a CLOSED SET
// defined in repo.ts - nothing from a request can reach it.
export async function setFlag(
  id: string, column: string, executor?: Executor
): Promise<void> {
  await query(sql("set_flag").replaceAll("__COLUMN__", column), [id], executor);
}

export async function setSupplier(
  id: string, supplier_id: string | null, executor?: Executor
): Promise<void> {
  await query(sql("set_supplier"), [supplier_id, id], executor);
}
