// payments.attempts, and nothing else.
//
// An attempt is what was TRIED against an intent, and it is the only row
// carrying a reference issued by a provider - a second processor would issue
// its own. Amounts are in DOLLARS; the caller divides Stripe's cents.
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { PaymentAttempt } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type AttemptRow = PaymentAttempt;

// An explicit id wins; every caller passes the intent's own id, so an intent
// and its first attempt share one.
export type NewAttempt = {
  id?: string | null;
  intent_id: string;
  provider: string | null;
  provider_ref: string;
  amount: number | null;
  status: string | null;
  method_id?: string | null;
};

export const PATCHABLE = [
  "status", "amount", "method_id", "provider", "provider_ref",
  "error_code", "error_message",
] as const;

export type AttemptPatch = Partial<Pick<AttemptRow, (typeof PATCHABLE)[number]>>;

export async function getOne(id: string, executor?: Executor): Promise<AttemptRow | undefined> {
  const { rows } = await query<AttemptRow>(sql("get_one"), [id], executor);
  return rows[0];
}

export async function listFor(intent_id: string, executor?: Executor): Promise<AttemptRow[]> {
  const { rows } = await query<AttemptRow>(sql("list_for_intent"), [intent_id], executor);
  return rows;
}

// By the provider's reference. UNIQUE on the column, so at most one row - and
// it is how a webhook, which knows only that reference, finds what to write.
export async function findByProviderRef(
  provider_ref: string, executor?: Executor
): Promise<AttemptRow | undefined> {
  const { rows } = await query<AttemptRow>(
    sql("find_by_provider_ref"), [provider_ref], executor
  );
  return rows[0];
}

export async function create(row: NewAttempt, executor?: Executor): Promise<AttemptRow> {
  const { rows } = await query<AttemptRow>(
    sql("create"),
    [row.id, row.intent_id, row.method_id, row.provider, row.provider_ref, row.amount, row.status],
    executor
  );
  return rows[0];
}

export async function update(
  id: string, patch: AttemptPatch, executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({
    table: "payments.attempts", allowed: PATCHABLE, patch, where: { id },
  });
  if (!built) return true;
  const { rowCount } = await query(built.text, built.values, executor);
  return rowCount === 1;
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql("delete"), [id], executor);
  return rowCount === 1;
}
