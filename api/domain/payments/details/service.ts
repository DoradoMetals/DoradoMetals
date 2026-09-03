// The payout account resource: recorded at the payout STEP (D210), linked at
// order creation, opened only by the admin bank-details read.
//
// ROUTING AND ACCOUNT NUMBERS ARE SEALED HERE - AES-256-GCM envelopes bound
// to the row id and the column name (shared/crypto/envelope.ts), so a copied
// envelope fails authentication anywhere but its own cell. Plaintext exists
// only inside this module's two functions, and never reaches a log, an error
// or a return value except from decryptFor, the admin read's single door.
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import * as details from "#db/payments/details/repo.ts";
import { seal, open, aadFor } from "#shared/crypto/envelope.ts";
import { payoutKeyFromEnv } from "#shared/crypto/payoutKey.ts";
import { refuse } from "#shared/http/refuse.ts";

export type PayoutForm = {
  method?: string;
  account_holder_name?: string;
  bank_name?: string | null;
  account_type?: string | null;
  routing_number?: string | null;
  account_number?: string | null;
  payout_email?: string | null;
};

const BANK_METHODS = new Set(["ACH", "WIRE"]);
const EMAIL_METHODS = new Set(["ECHECK", "DORADO_ACCOUNT"]);

// Save (or rewrite - the id is stable per checkout) the payout account. The
// caller passes the existing details id when the checkout already holds one.
export async function saveCheckoutPayout(
  {
    user_id, existing_id, form,
  }: { user_id: string; existing_id: string | null; form: PayoutForm },
  executor?: PoolClient
): Promise<details.CheckoutPayoutRow> {
  const method = String(form.method ?? "");
  if (!method || !form.account_holder_name) {
    throw refuse(400, "the payout needs a method and an account holder name");
  }
  if (BANK_METHODS.has(method)) {
    if (!form.routing_number || !form.account_number || !form.bank_name) {
      throw refuse(400, `${method} needs a bank name, a routing number and an account number`);
    }
    if (!/^\d{9}$/.test(String(form.routing_number))) {
      throw refuse(400, "the routing number must be 9 digits");
    }
    if (!/^\d+$/.test(String(form.account_number))) {
      throw refuse(400, "the account number must be digits");
    }
  } else if (EMAIL_METHODS.has(method)) {
    if (!form.payout_email) throw refuse(400, `${method} needs an email address`);
  } else {
    throw refuse(400, `no such payout method: ${method}`);
  }

  const id = existing_id ?? randomUUID();
  const key = payoutKeyFromEnv();
  const account = String(form.account_number ?? "");
  const routing = String(form.routing_number ?? "");

  const row = await details.saveForCheckout(
    {
      id,
      user_id,
      method,
      account_holder: form.account_holder_name ?? null,
      bank_name: form.bank_name ?? null,
      account_type: form.account_type ?? null,
      last_four: account.length >= 4 ? account.slice(-4) : null,
      // Stored beside the account's, for the same reason: the panel renders
      // both, and an order created here must look no different from one 114
      // migrated. The routing number itself goes in sealed, below.
      routing_last_four: routing.length >= 4 ? routing.slice(-4) : null,
      email_to: form.payout_email ?? null,
      routing_number_encrypted: form.routing_number
        ? seal(String(form.routing_number), key, aadFor(id, "routing_number"))
        : null,
      account_number_encrypted: form.account_number
        ? seal(account, key, aadFor(id, "account_number"))
        : null,
      encryption_key_id: BANK_METHODS.has(method) ? key.id : null,
    },
    executor
  );
  if (!row) throw refuse(400, `no such payout method: ${method}`);
  return row;
}

// THE ADMIN READ'S SINGLE DOOR. Opens the envelopes for one details row;
// answers null fields rather than throwing when a row carries none (an email
// method, or a pre-D210 row).
export async function decryptFor(
  details_id: string, executor?: PoolClient
): Promise<{
  method: string | null; account_holder: string | null; bank_name: string | null;
  account_type: string | null; email_to: string | null;
  routing_number: string | null; account_number: string | null;
} | null> {
  const row = await details.getEncrypted(details_id, executor);
  if (!row) return null;
  const key = payoutKeyFromEnv();
  return {
    method: row.method,
    account_holder: row.account_holder,
    bank_name: row.bank_name,
    account_type: row.account_type,
    email_to: row.email_to,
    routing_number: row.routing_number_encrypted
      ? open(row.routing_number_encrypted, key, aadFor(row.id, "routing_number"))
      : null,
    account_number: row.account_number_encrypted
      ? open(row.account_number_encrypted, key, aadFor(row.id, "account_number"))
      : null,
  };
}
