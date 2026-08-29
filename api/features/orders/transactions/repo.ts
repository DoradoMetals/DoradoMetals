// orders.transactions, and nothing else.
//
// WHAT ONE ORDER CAME TO. Not payments.ledger - that is the customer's credit
// BALANCE and lives in features/transactions. Two different things that share a
// word, and keeping them apart is why this sits under orders/.
//
// Mostly read: the figures an order comes to are computed by the order
// service's own paths rather than accepted from a caller. The writes at the
// bottom are the exception - the amounts an ADMIN adjusts by hand on a purchase
// order, the total they add up into, and (since 099) the payout account the
// order is paid out to.
import query from "#shared/db/query.js";
import { sqlFrom } from "#shared/db/sql.ts";
import type { orders } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

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

// THE VERBATIM ROW (ruling 12). It was a Pick of twenty-five columns until
// wave 3, when the order wire slimmed to the row plus `totals` and `totals`
// became this: a curated projection would have been a hand-written wire shape
// by another name, and validate:wire parses it against the generated
// TransactionsRow. The two audit id columns joined the statement with it.
export type OrderTotalsRow = orders.TransactionsRow;

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

// THE ORDER'S TOTAL - what the customer is paid on a purchase order.
//
// Separate from setAmount ON PURPOSE. That function serves a closed set of
// five ADJUSTABLE FEES; this one writes the number those fees add up into,
// and a call site that cannot tell the two apart is a call site one keystroke
// away from editing the wrong thing. sql/set_total.sql states it at length.
//
// `total` IS NULLABLE AND NULL IS MEANINGFUL: it is "this order is no longer
// priced", which is what clearing an order's pricing does before re-deriving
// it. Passed straight through, never coalesced. exchange's resetOrderTotal
// wrote exactly that.
//
// `by` behaves as it does in setAmount - null leaves the previous author
// alone rather than erasing them.
//
// NOTE FOR THE CALLER, and it is the reason this returns a row rather than
// void: this is an UPDATE, so an order with no orders.transactions row is a
// silent no-op. Under the dual write the mirror INSERTed that row from
// exchange; a native create path has to write it with createTotals. An
// undefined return means there was no row to write to, which is a caller's
// bug rather than a missing order.
export async function setTotal(
  order_id: string,
  total: number | null,
  by: string | null = null,
  executor?: Executor
): Promise<{ id: string; order_id: string; total: number | null } | undefined> {
  const { rows } = await query<{ id: string; order_id: string; total: number | null }>(
    sql("set_total"), [total, by, order_id], executor
  );
  return rows[0];
}

// THE ACCOUNT THIS ORDER'S PAYOUT GOES TO (099).
//
// A payout is one per order - measured across all 62 production payouts, not
// assumed - so the link belongs beside the fee it is charged for rather than in
// a table of its own. `payments.details` still owns the ACCOUNT; this owns
// which account an order points at, because orders.transactions is an orders
// table.
//
// An undefined return means there was no orders.transactions row to write to.
// Say so at the call site: the statement this replaces failed exactly that way
// and said nothing.
export async function setPayoutAccount(
  order_id: string,
  details_id: string | null,
  by: string | null = null,
  executor?: Executor
): Promise<{ id: string; order_id: string; payout_details_id: string | null } | undefined> {
  const { rows } = await query<{ id: string; order_id: string; payout_details_id: string | null }>(
    sql("set_payout_account"), [details_id, by, order_id], executor
  );
  return rows[0];
}
