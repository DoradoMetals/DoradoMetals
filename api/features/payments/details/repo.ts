// payments.details - the account a customer is paid out to.
//
// The legacy insertPayout wrote one flat row to exchange.payouts carrying the
// account, the order it belonged to, and the fee charged for it. Those are three
// different lifetimes: an account is reused across orders, an order link is per
// order, and a fee is a line on that order's transaction. This repo owns the
// FIRST ONLY. The other two live with the order, because they are columns of an
// orders table: orders/transactions.setPayoutAccount and
// orders/transactions.setAmount("payout_fee").
//
// THE LINK USED TO BE SET HERE AND IS NOT ANY MORE (099). It wrote
// payments.intents.details_id, on the assumption that an order reaches its
// payout account through its payment intent - and an intent is money coming IN,
// so for a purchase order there was never one to update. It matched nothing,
// silently, for every order it existed to serve. D168.
//
// It does NOT write routing_number or account_number - see sql/create.sql.
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { PoolClient } from "pg";

const sql = sqlFrom(import.meta.dirname);
const CREATE = sql("create");
const SET_METHOD = sql("set_method_for_order");

type PayoutAccount = {
  user_id: string;
  method: string;
  account_holder?: string | null;
  bank_name?: string | null;
  account_type?: string | null;
  last_four?: string | null;
  email_to?: string | null;
};

/**
 * Create the account row. Returns its id, or null when the method does not
 * resolve against payments.methods - the SELECT drives the INSERT, so an
 * unknown method inserts nothing rather than writing a row with a null method.
 */
export async function create(account: PayoutAccount, executor?: PoolClient) {
  const { rows } = await query(
    CREATE,
    [
      account.user_id,
      account.method,
      account.account_holder ?? null,
      account.bank_name ?? null,
      account.account_type ?? null,
      account.last_four ?? null,
      account.email_to ?? null,
    ],
    executor
  );
  return rows[0]?.id ?? null;
}

/** Change the payout method for one order, walking order -> transactions -> details. */
export async function setMethodForOrder(order_id: string, method: string, executor?: PoolClient) {
  const { rows } = await query(SET_METHOD, [order_id, method], executor);
  return rows.map((r) => r.id as string);
}

// ------------------------------------------------------ the payout step (D210)

export type CheckoutPayoutRow = {
  id: string;
  method_id: string | null;
  account_holder: string | null;
  bank_name: string | null;
  account_type: string | null;
  last_four: string | null;
  email_to: string | null;
};

export type CheckoutPayoutWrite = {
  id: string;
  user_id: string;
  method: string;
  account_holder: string | null;
  bank_name: string | null;
  account_type: string | null;
  last_four: string | null;
  email_to: string | null;
  routing_number_encrypted: string | null;
  account_number_encrypted: string | null;
  encryption_key_id: string | null;
};

// Returns undefined when the method resolves to nothing - the caller refuses
// rather than writing a detail row with no method.
export async function saveForCheckout(
  row: CheckoutPayoutWrite, executor?: PoolClient
): Promise<CheckoutPayoutRow | undefined> {
  const { rows } = await query<CheckoutPayoutRow>(
    sql("save_for_checkout"),
    [
      row.id, row.user_id, row.method, row.account_holder, row.bank_name,
      row.account_type, row.last_four, row.email_to,
      row.routing_number_encrypted, row.account_number_encrypted,
      row.encryption_key_id,
    ],
    executor
  );
  return rows[0];
}

export type EncryptedDetailsRow = CheckoutPayoutRow & {
  method: string | null;
  routing_number_encrypted: string | null;
  account_number_encrypted: string | null;
  encryption_key_id: string | null;
};

export async function getEncrypted(
  id: string, executor?: PoolClient
): Promise<EncryptedDetailsRow | undefined> {
  const { rows } = await query<EncryptedDetailsRow>(sql("get_encrypted"), [id], executor);
  return rows[0];
}
