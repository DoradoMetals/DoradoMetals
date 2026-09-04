// payments.details, and nothing else - the account a customer is paid out to.
//
// A detail row describes an ACCOUNT, not an order, and the same account serves
// many orders. That is why order_id is not a column here: the order link is
// orders.transactions.payout_details_id and the per-order fee is
// orders.transactions.payout_fee, each owned by the orders side.
//
// THE NUMBERS ARE RADIOACTIVE. Nothing in this file selects or writes
// routing_number or account_number - the legacy plaintext columns stay NULL -
// and the sealed envelopes have exactly one door, getSealed.
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { PaymentDetailsView, PaymentDetailsSealed } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";
import { columnsOf } from "#shared/db/columns.ts";
import { PaymentDetailsPatch } from "@dorado/contracts";

const sql = sqlFrom(import.meta.dirname);

// EVERY WRITABLE COLUMN, and the same object serves create and update - which
// is what lets the service build one payload and pass it through to either.
// user_id and id are not here: an account does not change hands, and the id is
// the key.
// THE COLUMNS, FROM THE CONTRACT (ruling 64) - `PaymentDetailsPatch` without
// the id (the key) and the user (an account does not change hands). The
// plaintext routing_number/account_number columns are not on that patch at
// all, which is the point: only the sealed envelopes are writable.
export const PATCHABLE = columnsOf(PaymentDetailsPatch.omit({ id: true, user_id: true }));

export async function getOne(id: string, executor?: Executor): Promise<PaymentDetailsView | undefined> {
  const { rows } = await query<PaymentDetailsView>(sql("get_one"), [id], executor);
  return rows[0];
}

export async function listFor(user_id: string, executor?: Executor): Promise<PaymentDetailsView[]> {
  const { rows } = await query<PaymentDetailsView>(sql("list_for_user"), [user_id], executor);
  return rows;
}

// By the provider's reference for the instrument - a Stripe pm_... id.
export async function findByProviderRef(
  provider: string | null, provider_ref: string, executor?: Executor
): Promise<PaymentDetailsView | undefined> {
  const { rows } = await query<PaymentDetailsView>(
    sql("find_by_provider_ref"), [provider, provider_ref], executor
  );
  return rows[0];
}

// THE ONE DOOR to the sealed numbers. Separate from getOne so a caller has to
// ask for them by name, and so nothing that merely reads an account can grow a
// leak by accident.
export async function getSealed(
  id: string, executor?: Executor
): Promise<PaymentDetailsSealed | undefined> {
  const { rows } = await query<PaymentDetailsSealed>(sql("get_sealed"), [id], executor);
  return rows[0];
}

// The id is the caller's: the checkout row keeps the same details row across
// edits, so it is minted once and reused.
export async function create(
  id: string, user_id: string, values: PaymentDetailsPatch, executor?: Executor
): Promise<PaymentDetailsView> {
  const { rows } = await query<PaymentDetailsView>(
    sql("create"),
    [
      id, user_id, values.method_id ?? null, values.account_holder ?? null,
      values.bank_name ?? null, values.account_type ?? null,
      values.last_four ?? null, values.routing_last_four ?? null,
      values.email_to ?? null, values.routing_number_encrypted ?? null,
      values.account_number_encrypted ?? null, values.encryption_key_id ?? null,
      values.card_brand ?? null, values.provider ?? null,
      values.provider_ref ?? null,
    ],
    executor
  );
  return rows[0];
}

// THE SAFE PROJECTION, and it is the same one sql/get_one.sql spells: an
// update answers the row it wrote, so nothing has to read the row back to
// learn what it now says (ruling 65). Never an envelope and never a plaintext
// number - a write path that returned one would be the leak this table's whole
// shape exists to prevent.
const RETURNING = `id, user_id, method_id, account_holder, bank_name, account_type,
       last_four, routing_last_four, card_brand, email_to,
       provider, provider_ref, created_at, updated_at`;

// ANSWERS THE ROW, or undefined when the id matches nothing. A patch naming no
// allowed column is not an error and not an empty UPDATE - it reads the row
// back, so "nothing to change" still answers what the row says.
export async function update(
  id: string, patch: PaymentDetailsPatch, executor?: Executor
): Promise<PaymentDetailsView | undefined> {
  const built = buildUpdate({
    table: "payments.details", allowed: PATCHABLE, patch, where: { id },
    returning: RETURNING,
  });
  if (!built) return await getOne(id, executor);
  const { rows } = await query<PaymentDetailsView>(built.text, built.values, executor);
  return rows[0];
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql("delete"), [id], executor);
  return rowCount === 1;
}
