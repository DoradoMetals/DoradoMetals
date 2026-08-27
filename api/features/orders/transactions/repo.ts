// orders.transactions, and nothing else.
//
// WHAT ONE ORDER CAME TO. Not payments.ledger - that is the customer's credit
// BALANCE and lives in features/transactions. Two different things that share a
// word, and keeping them apart is why this sits under orders/.
//
// Mostly read: the figures an order comes to are computed by the order
// service's own paths rather than accepted from a caller. The four writes at
// the bottom are the exception - they are the amounts an ADMIN adjusts by hand
// on a purchase order, which nothing derives.
import query from "#shared/db/query.js";
import { sqlFrom } from "#shared/db/sql.ts";
import type { orders } from "@dorado/contracts";
import type { PoolClient } from "pg";

const sql = sqlFrom(import.meta.dirname);

export type Executor = PoolClient | undefined;

// THE FOUR ADJUSTABLE AMOUNTS, AS A CLOSED SET. exchange had four functions
// differing only in a column name; sql/set_amount.sql interpolates it, which is
// safe for the same reason the order flags are - these four literals are the
// only values that can reach the substitution.
export const AMOUNTS = {
  shipping_fee_actual: "shipping_fee_actual",
  refiner_fee: "refiner_fee",
  pool_oz_deducted: "pool_oz_deducted",
  pool_remediation: "pool_remediation",
  // exchange kept this on the payout row as `cost`. It is a per-order FEE, not
  // a property of the bank account, so migration 073 split it off here while
  // the account itself became payments.details. That split is why editing a
  // payout charge does not touch the payments schema at all.
  payout_fee: "payout_fee",
} as const;

export type Amount = keyof typeof AMOUNTS;

export type OrderTotalsRow = Pick<
  orders.TransactionsRow,
  | "id" | "order_id" | "total" | "items" | "shipping" | "surcharge"
  | "sales_tax" | "funds" | "base_total" | "post_charges_amount"
  | "subject_to_charges_amount" | "used_funds" | "waive_shipping_fee"
  | "waive_payout_fee" | "shipping_paid" | "shipping_fee_actual"
  | "refiner_fee" | "payout_fee" | "pool_remediation" | "pool_oz_deducted"
  | "shipping_service" | "created_by" | "updated_by" | "created_at" | "updated_at"
>;

export async function getFor(
  order_id: string, executor?: Executor
): Promise<OrderTotalsRow | undefined> {
  const { rows } = await query<OrderTotalsRow>(sql("get_for"), [order_id], executor);
  return rows[0];
}

export async function getMany(
  order_ids: string[], executor?: Executor
): Promise<OrderTotalsRow[]> {
  if (order_ids.length === 0) return [];
  const { rows } = await query<OrderTotalsRow>(sql("get_many"), [order_ids], executor);
  return rows;
}

// One of the four amounts an admin adjusts on a purchase order.
// `by` defaults to null, and null COALESCES to the existing value rather than
// erasing it - which is exactly what the four exchange statements did, since
// none of them touched updated_by at all. Callers that know the admin can say
// so; callers that do not leave the previous author alone.
export async function setAmount(
  order_id: string,
  field: Amount,
  value: number | null,
  by: string | null = null,
  executor?: Executor
): Promise<{ id: string; order_id: string; value: number | null } | undefined> {
  const { rows } = await query<{ id: string; order_id: string; value: number | null }>(
    sql("set_amount").replaceAll("__COLUMN__", AMOUNTS[field]), [value, by, order_id], executor
  );
  return rows[0];
}
