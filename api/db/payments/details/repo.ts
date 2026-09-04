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
import type { PaymentDetails } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

// The safe projection: last four digits and nothing else of the bank.
export type DetailRow = Pick<
  PaymentDetails,
  | "id" | "user_id" | "method_id" | "account_holder" | "bank_name"
  | "account_type" | "last_four" | "routing_last_four" | "card_brand"
  | "email_to" | "provider" | "provider_ref" | "created_at" | "updated_at"
>;

// The envelopes plus what identifies the row they belong to. Read by the admin
// bank-details door alone.
export type SealedDetailRow = Pick<
  PaymentDetails,
  | "id" | "account_holder" | "bank_name" | "account_type" | "last_four"
  | "email_to" | "method_id" | "routing_number_encrypted"
  | "account_number_encrypted" | "encryption_key_id"
>;

// EVERY WRITABLE COLUMN, and the same object serves create and update - which
// is what lets the service build one payload and pass it through to either.
// user_id and id are not here: an account does not change hands, and the id is
// the key.
export const PATCHABLE = [
  "method_id", "account_holder", "bank_name", "account_type", "card_brand",
  "last_four", "routing_last_four", "email_to", "provider", "provider_ref",
  "routing_number_encrypted", "account_number_encrypted", "encryption_key_id",
] as const;

export type DetailValues = Partial<Pick<PaymentDetails, (typeof PATCHABLE)[number]>>;

export async function getOne(id: string, executor?: Executor): Promise<DetailRow | undefined> {
  const { rows } = await query<DetailRow>(sql("get_one"), [id], executor);
  return rows[0];
}

export async function listFor(user_id: string, executor?: Executor): Promise<DetailRow[]> {
  const { rows } = await query<DetailRow>(sql("list_for_user"), [user_id], executor);
  return rows;
}

// By the provider's reference for the instrument - a Stripe pm_... id.
export async function findByProviderRef(
  provider: string | null, provider_ref: string, executor?: Executor
): Promise<DetailRow | undefined> {
  const { rows } = await query<DetailRow>(
    sql("find_by_provider_ref"), [provider, provider_ref], executor
  );
  return rows[0];
}

// THE ONE DOOR to the sealed numbers. Separate from getOne so a caller has to
// ask for them by name, and so nothing that merely reads an account can grow a
// leak by accident.
export async function getSealed(
  id: string, executor?: Executor
): Promise<SealedDetailRow | undefined> {
  const { rows } = await query<SealedDetailRow>(sql("get_sealed"), [id], executor);
  return rows[0];
}

// The id is the caller's: the checkout row keeps the same details row across
// edits, so it is minted once and reused.
export async function create(
  id: string, user_id: string, values: DetailValues, executor?: Executor
): Promise<DetailRow> {
  const { rows } = await query<DetailRow>(
    sql("create"),
    [
      id, user_id, values.method_id, values.account_holder, values.bank_name,
      values.account_type, values.last_four, values.routing_last_four,
      values.email_to, values.routing_number_encrypted,
      values.account_number_encrypted, values.encryption_key_id,
      values.card_brand, values.provider, values.provider_ref,
    ],
    executor
  );
  return rows[0];
}

export async function update(
  id: string, patch: DetailValues, executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({
    table: "payments.details", allowed: PATCHABLE, patch, where: { id },
  });
  if (!built) return true;
  const { rowCount } = await query(built.text, built.values, executor);
  return rowCount === 1;
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql("delete"), [id], executor);
  return rowCount === 1;
}
