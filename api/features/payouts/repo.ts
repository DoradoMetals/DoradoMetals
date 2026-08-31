// exchange.payouts, and nothing else - READ ONLY, and only the last four
// digits.
//
// THIS IS THE MOST SENSITIVE TABLE IN THE DATABASE. It holds routing and
// account numbers in plaintext: fourteen of them in production, ten ACH and
// eight WIRE. The order response has never carried the full values and must
// not start, so `right(..., 4)` happens IN THE STATEMENT - the full number
// never leaves Postgres and cannot be logged by anything in between.
//
// There is no write path here on purpose. Payouts are still written through
// the purchase-order service's own path, and `payments.details` - where these
// land eventually - must not receive them until the encryption question is
// answered. Adding a writer here would make that easier to do by accident.
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

// account_last4 and routing_last4, NEVER account_number or routing_number. The
// type says so as much as the statement does.
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

// One payout by its OWN id - what PATCH /api/payouts/:id resolves before
// dispatching its order-keyed writes. Same projection discipline as getFor:
// last-4 only, the full numbers never leave Postgres on this path.
export async function getById(
  id: string, executor?: Executor
): Promise<PayoutRow | undefined> {
  const { rows } = await query<PayoutRow>(sql("get_by_id"), [id], executor);
  return rows[0];
}

// THE FULL BANK DETAILS, for GET /payouts/:id/details ONLY - see
// sql/get_details.sql for the rules. The VERBATIM exchange.payouts row
// (ruling 12). Deliberately a separate type from PayoutRow so a projection
// cannot pick these fields up by accident, and NEVER logged or embedded in
// an order payload.
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
