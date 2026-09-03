// A payout is an ACCOUNT plus a FEE, and since D213 both are read natively:
// the account from payments.details, the fee from orders.transactions. READ
// ONLY, and only the last four digits.
//
// *** WHY THIS MOVED. *** These projections read exchange.payouts until
// 2026-09-02. D210 sealed new accounts into payments.details and D212 stopped
// exchange receiving payout writes, so every order created after the purge had
// no exchange row and this feature answered nothing for it - the composed
// order served an all-null payout and priced the fee as 0. Migration 114
// carried the two last-four values across so the move loses no value.
//
// THE FULL NUMBERS ARE STILL RADIOACTIVE, and no statement in this file selects
// one. The last-four columns are the only bank values here. The full numbers
// live in payments.details as AES-256-GCM envelopes and are opened in exactly
// one place, payments/details' `decryptFor`, behind the admin details endpoint.
//
// *** THE PLAINTEXT READS ARE GONE. *** getDetails and getDetailsByOrder used
// to `SELECT routing_number, account_number FROM exchange.payouts`, which was
// the last live read of a plaintext bank number anywhere in this codebase.
// scripts/encrypt-payout-details.ts seals those values into payments.details
// instead; it has been run against dev (which holds no bank numbers at all, so
// it sealed nothing and said so), and PRODUCTION IS JACOB'S TO RUN, in the
// pg_dump -> migrate -> backfill -> verify sequence.
//
// THE ORDER WITHIN THAT SEQUENCE MATTERS HERE, measured read-only against
// production on 2026-09-03: the script joins payments.details to
// exchange.payouts ON id, and TODAY that join resolves ZERO of production's 62
// payouts, because all 56 of its payments.details rows are January residue and
// not one shares an id with a payout. 073 is what gives a backfilled details
// row its payout's own id, and 073 has never run there. So the fourteen
// plaintext payouts reach this endpoint only after 071 + 073 + encrypt:payouts,
// in that order; until then this read answers their bank numbers as null. No
// exchange row moves either way - the rows stay exactly where they are, as the
// covenant requires.
//
// There is no write path here on purpose. The account is written by
// features/payments/details (sealed, D210) and the fee by
// orders.transactions; a writer here would make it easy to grow one by
// accident, which is how the numbers got copied around in the first place.
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

// account_last4 and routing_last4, NEVER account_number or routing_number. The
// type says so as much as the statement does. `id` is the payments.details id -
// equal to the old payout id on any database built by 073, which gave each
// backfilled row the payout's own id.
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
