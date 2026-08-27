// payments.details - the account a customer is paid out to.
//
// The legacy insertPayout wrote one flat row to exchange.payouts carrying the
// account, the order it belonged to, and the fee charged for it. Those are three
// different lifetimes: an account is reused across orders, an order link is per
// order, and a fee is a line on that order's transaction. This repo owns the
// first. The other two are `linkToOrder` below and
// orders/transactions.setAmount("payout_fee") respectively.
//
// It does NOT write routing_number or account_number - see sql/create.sql.
import query from "#shared/db/query.js";
import { sqlFrom } from "#shared/db/sql.ts";
import type { PoolClient } from "pg";

const sql = sqlFrom(import.meta.dirname);
const CREATE = sql("create");
const LINK = sql("link_to_order");
const SET_METHOD = sql("set_method_for_order");

export type PayoutAccount = {
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

/** Point an order's existing payment intent at this account. */
export async function linkToOrder(order_id: string, details_id: string, executor?: PoolClient) {
  const { rows } = await query(LINK, [order_id, details_id], executor);
  return rows.map((r) => r.id as string);
}

/** Change the payout method for one order, walking order -> intent -> details. */
export async function setMethodForOrder(order_id: string, method: string, executor?: PoolClient) {
  const { rows } = await query(SET_METHOD, [order_id, method], executor);
  return rows.map((r) => r.id as string);
}
