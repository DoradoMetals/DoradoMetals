// orders.transactions - CRUD only. WHAT ONE ORDER CAME TO; not the customer's
// credit BALANCE, which is payments/transactions. Two things, one word.
import { randomUUID } from "node:crypto";
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Executor } from "#shared/db/executor.ts";
import { columnsOf } from "#shared/db/columns.ts";
import { OrderTotals, OrderTotalsWrite } from "@dorado/contracts";
import type { Direction, OrderTotalsPatch } from "@dorado/contracts";

const sql = sqlFrom(import.meta.dirname);


export async function getFor(
  order_id: string, executor?: Executor
): Promise<OrderTotals | undefined> {
  const { rows } = await query<OrderTotals>(sql("get_for"), [order_id], executor);
  return rows[0];
}

export async function getMany(
  order_ids: string[], executor?: Executor
): Promise<OrderTotals[]> {
  if (order_ids.length === 0) return [];
  const { rows } = await query<OrderTotals>(sql("get_many"), [order_ids], executor);
  return rows;
}

// ONE UPDATE, KEYED BY ORDER. Every amount is NULLABLE AND NULL IS MEANINGFUL -
// "no longer priced" is what clearing pricing writes - so buildUpdate's
// absent/null/value distinction is load-bearing.
//
// The direction guard is evaluated IN THE STATEMENT: a payout-fee waiver is a
// purchase fact and a sale must answer "not written". It is a cross-table
// EXISTS, which buildUpdate's WHERE cannot spell, so it is appended.
// "shipping" joined this list for the label-after-commit rewrite: the row is
// created with it NULL (the quote is bundled with the label purchase, and that
// now happens AFTER the write - domain/shipping/labels.ts), so the AFTER step
// patches it in once the carrier has answered.
// THE COLUMNS, FROM THE CONTRACT (ruling 64) - `OrderTotalsWrite`. A pick
// rather than an omit because most of this table is NOT writable through here:
// the customer-facing subtotals are derived at placement and rewritten by
// finalize-pricing.
const PATCHABLE = columnsOf(OrderTotalsWrite);

export async function update(
  order_id: string,
  patch: OrderTotalsWrite,
  guard: { direction?: Direction } = {},
  executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({
    table: "orders.transactions",
    allowed: PATCHABLE,
    patch,
    where: { order_id },
    returning: "id",
  });
  if (!built) return true;

  // buildUpdate hands back a fresh array each call, so the guard's parameter is
  // pushed onto it rather than onto a copy of it.
  let { text } = built;
  const { values } = built;
  if (guard.direction) {
    values.push(guard.direction);
    text = text.replace(
      "\n RETURNING",
      `\n   AND EXISTS (SELECT 1 FROM orders.orders o
                  WHERE o.id = orders.transactions.order_id
                    AND o.direction = $${values.length}::orders.direction)\n RETURNING`
    );
  }
  const { rowCount } = await query(text, values, executor);
  return rowCount === 1;
}

// WHAT A PURCHASE COMES TO AT PLACEMENT: the payout ACCOUNT is the checkout
// row's, so the statement copies it (ruling 66); the payout method's flat fee
// is a figure the server looked up, so it is a parameter.
export async function createForCheckout(
  { order_id, checkout_id, payout_fee }:
    { order_id: string; checkout_id: string; payout_fee: number },
  executor?: Executor
): Promise<OrderTotals | undefined> {
  const { rows } = await query<OrderTotals>(
    sql("create_for_purchase"), [order_id, payout_fee, checkout_id], executor
  );
  return rows[0];
}

// A SALE'S TOTALS, every figure of which the pricing service decided - there
// is nothing to copy, so this is the one create that still binds values.
export async function create(row: OrderTotalsPatch, executor?: Executor): Promise<void> {
  await query(
    sql("create"),
    [
      randomUUID(), row.order_id,
      row.total ?? null, row.shipping ?? null, row.shipping_service ?? null,
      row.funds ?? null, row.post_charges_amount ?? null,
      row.subject_to_charges_amount ?? null, row.used_funds ?? null,
      row.items ?? null, row.base_total ?? null, row.surcharge ?? null,
      row.sales_tax ?? null, row.payout_fee ?? null, row.payout_details_id ?? null,
    ],
    executor
  );
}
