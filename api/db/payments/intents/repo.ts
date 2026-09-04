// payments.intents, and nothing else.
//
// An intent is what was ASKED FOR. What was tried is payments.attempts and
// what settled is payments.settlements, each with its own repo - the provider's
// reference for a charge lives on the attempt, because a second processor would
// issue its own.
//
// MONEY IS IN DOLLARS here, as everywhere else in the new schema. Stripe speaks
// cents, so every caller divides on the way in. Getting it backwards is a
// hundredfold error.
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Direction, PaymentIntent, PaymentIntentView } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type IntentRow = PaymentIntent;

// The COMPOSED intent - the wire shape, joined across the attempt, the
// settlement and the instrument. The two timestamps are the exception to
// taking the contract unchanged: a contract describes the WIRE, where JSON
// made a timestamp a string, and pg hands back a Date.
export type ComposedIntentRow = Omit<PaymentIntentView, "created_at" | "updated_at"> & {
  created_at: Date;
  updated_at: Date;
};

// The payment FACTS order creation decides on (D211). The amount is in CENTS -
// see sql/find_facts_by_ref.sql.
export type IntentFacts = {
  payment_intent_id: string;
  intent_id: string;
  attempt_id: string;
  user_id: string | null;
  session_id: string | null;
  type: string | null;
  payment_status: string | null;
  amount: number | null;
  order_id: string | null;
  direction: Direction | null;
};

// An explicit id wins; omitting one lets create.sql generate it.
export type NewIntent = {
  id?: string | null;
  session_id: string | null;
  user_id: string | null;
  type: string | null;
  status: string | null;
  amount_expected: number | null;
  order_id?: string | null;
  details_id?: string | null;
  method_id?: string | null;
};

export const PATCHABLE = [
  "status", "amount_expected", "order_id", "details_id", "method_id",
] as const;

export type IntentPatch = Partial<Pick<IntentRow, (typeof PATCHABLE)[number]>>;

export async function getOne(id: string, executor?: Executor): Promise<IntentRow | undefined> {
  const { rows } = await query<IntentRow>(sql("get_one"), [id], executor);
  return rows[0];
}

// NO listFor(user_id), AND THAT IS MEASURED RATHER THAN FORGOTTEN. Nothing
// lists a customer's intents today, and payments.intents carries no index
// leading with user_id - audit:query-paths reports the read as having no index
// to enter by. The read and the index belong in the same change; adding the
// read alone would be a sequential scan on the money table.

export async function create(row: NewIntent, executor?: Executor): Promise<IntentRow> {
  const { rows } = await query<IntentRow>(
    sql("create"),
    [
      row.id, row.session_id, row.user_id, row.type, row.status,
      row.amount_expected, row.order_id, row.details_id, row.method_id,
    ],
    executor
  );
  return rows[0];
}

export async function update(
  id: string, patch: IntentPatch, executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({
    table: "payments.intents", allowed: PATCHABLE, patch, where: { id },
  });
  // An empty patch changed nothing and nothing failed.
  if (!built) return true;
  const { rowCount } = await query(built.text, built.values, executor);
  return rowCount === 1;
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql("delete"), [id], executor);
  return rowCount === 1;
}

// THE READ THAT CAN CHARGE A CUSTOMER TWICE: an intent is reusable only while
// it has not resolved. See sql/find_reusable.sql for the excluded statuses.
export async function findReusable(
  key: { session_id: string; user_id: string | null; type: string | null },
  executor?: Executor
): Promise<ComposedIntentRow | undefined> {
  const { rows } = await query<ComposedIntentRow>(
    sql("find_reusable"), [key.session_id, key.user_id, key.type], executor
  );
  return rows[0];
}

export async function findForOrder(
  order_id: string, executor?: Executor
): Promise<ComposedIntentRow | undefined> {
  const { rows } = await query<ComposedIntentRow>(
    sql("find_for_order"), [order_id], executor
  );
  return rows[0];
}

// THE INTENT A CUSTOMER IS CHECKING OUT WITH, keyed on the customer rather
// than on an id from a request body - see sql/find_open_for_user.sql.
export async function findOpenForUser(
  user_id: string, executor?: Executor
): Promise<IntentFacts | undefined> {
  const { rows } = await query<IntentFacts>(
    sql("find_open_for_user"), [user_id], executor
  );
  return rows[0];
}

// By the PROVIDER's reference, which is a column of payments.attempts - hence
// the join. The intent's own id is returned with it, so a caller that goes on
// to write keys by that.
export async function findFactsByRef(
  provider_ref: string, executor?: Executor
): Promise<IntentFacts | undefined> {
  const { rows } = await query<IntentFacts>(
    sql("find_facts_by_ref"), [provider_ref], executor
  );
  return rows[0];
}
