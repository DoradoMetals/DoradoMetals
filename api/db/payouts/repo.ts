// A payout is an ACCOUNT plus a FEE, and since D213 both are read natively:
// the account from payments.details, the fee from orders.transactions. READ
// ONLY, and only the last four digits - the full numbers are still
// radioactive and no statement in this file selects one.
//
// There is no write path here on purpose. The account is written by
// features/payments/details (sealed, D210) and the fee by
// orders.transactions; a writer here would make it easy to grow one by
// accident, which is how the numbers got copied around in the first place.
import query from "#shared/db/query.ts";
import type { Payout } from "@dorado/contracts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

// account_last4 and routing_last4 only, never account_number or routing_number.
// `id` is the payments.details id, equal to the old payout id on any database
// built by migration 073.
//
// THE CONTRACT OWNS THE SHAPE, and it is used by its own name. This carried a
// `PayoutRow = Payout` alias so callers could say "row" - a second name for
// one type, which is the drift lint:type-homes exists to catch, spelled as an
// alias so it never showed up as one.

export async function getFor(
  order_id: string, executor?: Executor
): Promise<Payout | undefined> {
  const { rows } = await query<Payout>(sql("get_for"), [order_id], executor);
  return rows[0];
}

export async function getMany(
  order_ids: string[], executor?: Executor
): Promise<Payout[]> {
  if (order_ids.length === 0) return [];
  const { rows } = await query<Payout>(sql("get_many"), [order_ids], executor);
  return rows;
}

// One payout by its own id - what PATCH /api/payouts/:id resolves before dispatching its order-keyed writes.
export async function getById(
  id: string, executor?: Executor
): Promise<Payout | undefined> {
  const { rows } = await query<Payout>(sql("get_by_id"), [id], executor);
  return rows[0];
}
