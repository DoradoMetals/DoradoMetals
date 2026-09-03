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
import { randomUUID } from "node:crypto";
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { orders } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

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

// ONE UPDATE (Jacob, 2026-09-02: one place per table to do CRUD, a patch
// object in, no per-column wrappers). The SET clause is built from the
// whitelisted column list, same shape as orders/repo.ts.
//
// KEYED BY ORDER, because the row is one per order. This is an UPDATE, so an
// order with no orders.transactions row is answered with undefined rather
// than a row - a caller's bug (the create path writes the row), and the
// caller says so.
//
// `total` and every amount are NULLABLE AND NULL IS MEANINGFUL - "no longer
// priced" is what clearing pricing writes - so patch values pass through
// verbatim, never coalesced.
//
// updated_by LEFT THIS LIST, and updated_at left the SET clause: both are
// written by the public.audit_stamp trigger from the actor on the connection
// (migration 116). The old note here - "a caller that wants updated_by kept
// simply omits it from the patch" - described a choice no caller has any more.
//
// The optional direction guard is evaluated IN THE STATEMENT: the payout-fee
// waiver is a purchase-order fact, and a sale's row must answer "not
// written" rather than take the flag.
const PATCHABLE = [
  "total", "shipping_fee_actual", "refiner_fee", "pool_oz_deducted",
  "pool_remediation", "payout_fee", "waive_payout_fee", "payout_details_id",
] as const;
type TotalsColumn = (typeof PATCHABLE)[number];
export type TotalsPatch = Partial<Record<TotalsColumn, string | number | boolean | null>>;
export type TotalsGuard = { direction?: "purchase" | "sale" };

export async function update(
  order_id: string, patch: TotalsPatch, guard: TotalsGuard = {}, executor?: Executor
): Promise<OrderTotalsRow | undefined> {
  const cols = PATCHABLE.filter((c) => c in patch);
  if (!cols.length) return undefined;
  const sets = cols.map((c, i) => `${c} = $${i + 2}`);
  const values: unknown[] = [order_id, ...cols.map((c) => patch[c] ?? null)];
  const wheres = ["order_id = $1"];
  if (guard.direction) {
    values.push(guard.direction);
    wheres.push(
      `EXISTS (SELECT 1 FROM orders.orders o
                WHERE o.id = orders.transactions.order_id
                  AND o.direction = $${values.length}::orders.direction)`
    );
  }
  const { rows } = await query<OrderTotalsRow>(
    `UPDATE orders.transactions SET ${sets.join(", ")}
      WHERE ${wheres.join(" AND ")}
      RETURNING *`,
    values,
    executor
  );
  return rows[0];
}

// THE ROW (Jacob, 2026-09-01) - named fields in the wire's own vocabulary,
// mapped onto sql/create.sql's parameter order in exactly one place. The five
// renames from exchange's names are stated in that file.
export type NewOrderTotals = {
  id?: string; order_id: string;
  total?: number | null; shipping?: number | null; shipping_service?: string | null;
  funds?: number | null; post_charges_amount?: number | null;
  subject_to_charges_amount?: number | null; used_funds?: boolean | null;
  items?: number | null; base_total?: number | null; surcharge?: number | null;
  sales_tax?: number | null;
};

export async function create(row: NewOrderTotals, executor?: Executor): Promise<void> {
  await query(
    sql("create"),
    [
      row.id ?? randomUUID(), row.order_id,
      row.total ?? null, row.shipping ?? null, row.shipping_service ?? null,
      row.funds ?? null, row.post_charges_amount ?? null,
      row.subject_to_charges_amount ?? null, row.used_funds ?? null,
      row.items ?? null, row.base_total ?? null, row.surcharge ?? null,
      row.sales_tax ?? null,
    ],
    executor
  );
}
