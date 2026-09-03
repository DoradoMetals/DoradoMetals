// A payout is an ACCOUNT (payments.details) plus a FEE (orders.transactions). Read only by design - no write path here, to keep the one door onto full bank numbers narrow.
// Full account/routing numbers are still radioactive (plaintext survives in exchange.payouts and payments.details): no projection here selects them except getDetails below.
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

// account_last4 and routing_last4 only, never account_number or routing_number. `id` is the payments.details id, equal to the old payout id on any database built by migration 073.
export type PayoutRow = {
  id: string;
  user_id: string | null;
  order_id: string | null;
  method: string | null;
  account_holder_name: string | null;
  bank_name: string | null;
  account_type: string | null;
  account_last4: string | null;
  routing_last4: string | null;
  email_to: string | null;
  cost: number | null;
  created_at: Date | null;
};

export async function getFor(
  order_id: string, executor?: Executor
): Promise<PayoutRow | undefined> {
  const { rows } = await query<PayoutRow>(sql("get_for"), [order_id], executor);
  return rows[0];
}

export async function getMany(
  order_ids: string[], executor?: Executor
): Promise<PayoutRow[]> {
  if (order_ids.length === 0) return [];
  const { rows } = await query<PayoutRow>(sql("get_many"), [order_ids], executor);
  return rows;
}

// One payout by its own id - what PATCH /api/payouts/:id resolves before dispatching its order-keyed writes.
export async function getById(
  id: string, executor?: Executor
): Promise<PayoutRow | undefined> {
  const { rows } = await query<PayoutRow>(sql("get_by_id"), [id], executor);
  return rows[0];
}

// Full bank details, for GET /payouts/:id/details ONLY. Deliberately a separate type from PayoutRow so a projection can't pick these up by accident - never logged or embedded in an order payload.
export type PayoutDetailsRow = {
  id: string;
  user_id: string | null;
  order_id: string | null;
  method: string | null;
  account_holder_name: string | null;
  bank_name: string | null;
  account_type: string | null;
  routing_number: string | null;
  account_number: string | null;
  created_at: Date | null;
  email_to: string | null;
  cost: number | null;
};

export async function getDetails(
  id: string, executor?: Executor
): Promise<PayoutDetailsRow | undefined> {
  const { rows } = await query<PayoutDetailsRow>(sql("get_details"), [id], executor);
  return rows[0];
}

// Legacy plaintext, resolved by order instead of by id - see get_details_by_order.sql for when that distinction matters.
export async function getDetailsByOrder(
  order_id: string, executor?: Executor
): Promise<PayoutDetailsRow | undefined> {
  const { rows } = await query<PayoutDetailsRow>(sql("get_details_by_order"), [order_id], executor);
  return rows[0];
}

export async function orderOfDetails(
  details_id: string, executor?: Executor
): Promise<string | null> {
  const { rows } = await query<{ order_id: string }>(
    sql("order_of_details"), [details_id], executor
  );
  return rows[0]?.order_id ?? null;
}
