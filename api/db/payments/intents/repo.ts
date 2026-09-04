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
import type { PaymentIntent, PaymentIntentView, PaymentIntentFacts } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";
import { columnsOf } from "#shared/db/columns.ts";
import { PaymentIntentPatch } from "@dorado/contracts";

const sql = sqlFrom(import.meta.dirname);

// THE COMPOSED INTENT IS `PaymentIntentView` ITSELF - the wire shape, joined
// across the attempt, the settlement and the instrument. This used to carry a
// local `ComposedIntentRow`, an `Omit<>&{}` that widened created_at/updated_at
// to `Date` on the theory that pg hands back a Date where the contract says
// string; nothing here ever calls a Date method on either column, and every
// other read in this file already returns the contract's own (string-typed)
// entity the same way, so the override bought nothing but a second name for
// one shape.

// THE WRITE SHAPE IS THE CONTRACT'S - `PaymentIntentPatch`, which create and
// update both take. The two local ones this replaced (`NewIntent` for the
// insert, `IntentPatch` for the update) were the same columns listed twice.
// An explicit id wins; omitting one lets create.sql generate it.
// THE COLUMNS, FROM THE CONTRACT (ruling 64) - the create's own shape without
// the four an intent is BORN with and never changes: its id, the session and
// customer it belongs to, and what kind it is.
export const PATCHABLE = columnsOf(
  PaymentIntentPatch.omit({ id: true, session_id: true, user_id: true, type: true })
);

export async function getOne(id: string, executor?: Executor): Promise<PaymentIntent | undefined> {
  const { rows } = await query<PaymentIntent>(sql("get_one"), [id], executor);
  return rows[0];
}

// NO listFor(user_id), AND THAT IS MEASURED RATHER THAN FORGOTTEN. Nothing
// lists a customer's intents today, and payments.intents carries no index
// leading with user_id - audit:query-paths reports the read as having no index
// to enter by. The read and the index belong in the same change; adding the
// read alone would be a sequential scan on the money table.

export async function create(
  row: PaymentIntentPatch, executor?: Executor
): Promise<PaymentIntent> {
  const { rows } = await query<PaymentIntent>(
    sql("create"),
    [
      row.id ?? null, row.session_id ?? null, row.user_id ?? null,
      row.type ?? null, row.status ?? null, row.amount_expected ?? null,
      row.order_id ?? null, row.details_id ?? null, row.method_id ?? null,
    ],
    executor
  );
  return rows[0];
}

export async function update(
  id: string, patch: PaymentIntentPatch, executor?: Executor
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
): Promise<PaymentIntentView | undefined> {
  const { rows } = await query<PaymentIntentView>(
    sql("find_reusable"), [key.session_id, key.user_id, key.type], executor
  );
  return rows[0];
}

export async function findForOrder(
  order_id: string, executor?: Executor
): Promise<PaymentIntentView | undefined> {
  const { rows } = await query<PaymentIntentView>(
    sql("find_for_order"), [order_id], executor
  );
  return rows[0];
}

// THE INTENT A CUSTOMER IS CHECKING OUT WITH, keyed on the customer rather
// than on an id from a request body - see sql/find_open_for_user.sql.
export async function findOpenForUser(
  user_id: string, executor?: Executor
): Promise<PaymentIntentFacts | undefined> {
  const { rows } = await query<PaymentIntentFacts>(
    sql("find_open_for_user"), [user_id], executor
  );
  return rows[0];
}

// By the PROVIDER's reference, which is a column of payments.attempts - hence
// the join. The intent's own id is returned with it, so a caller that goes on
// to write keys by that.
export async function findFactsByRef(
  provider_ref: string, executor?: Executor
): Promise<PaymentIntentFacts | undefined> {
  const { rows } = await query<PaymentIntentFacts>(
    sql("find_facts_by_ref"), [provider_ref], executor
  );
  return rows[0];
}
