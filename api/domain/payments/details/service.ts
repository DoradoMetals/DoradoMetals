// The payout account: recorded at the payout STEP (D210), linked at order
// creation, opened only by the admin bank-details read.
//
// ROUTING AND ACCOUNT NUMBERS ARE SEALED HERE - AES-256-GCM envelopes bound to
// the row id and the column name (shared/crypto/envelope.ts), so a copied
// envelope fails authentication anywhere but its own cell. Plaintext exists
// only inside this module's two functions and never reaches a log, an error or
// a return value except from decryptFor, the admin read's single door.
import { randomUUID } from "node:crypto";
import * as details from "#db/payments/details/repo.ts";
import * as methods from "#db/payments/methods/repo.ts";
import { seal, open, aadFor } from "#shared/crypto/envelope.ts";
import { payoutKeyFromEnv } from "#shared/crypto/payoutKey.ts";
import { Invalid } from "#shared/errors.ts";
import type { DetailRow, DetailValues } from "#db/payments/details/repo.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { checkout } from "@dorado/contracts";

export type { DetailRow } from "#db/payments/details/repo.ts";

// THE FORM IS THE CONTRACT'S, not a second declaration of it: the checkout
// controller parses a body against checkout.checkouts.PayoutForm and hands the result
// straight here, so a field added there and not here cannot happen.
export type PayoutForm = checkout.checkouts.PayoutForm;

const BANK_METHODS = new Set(["ACH", "WIRE"]);
const EMAIL_METHODS = new Set(["ECHECK", "DORADO_ACCOUNT"]);

// THE PAYOUT FORM IS A COMPLETE DOCUMENT, NOT A PATCH. A field the customer
// left empty must CLEAR its column, and shared/db/patch.ts reads `undefined` as
// "not named" - so absence has to arrive as an explicit null or switching from
// a bank method to an email one would leave the old bank name behind.
const cleared = <T>(value: T | null | undefined): T | null => value ?? null;

// The last four digits are NOT a secret: they are what every order payload and
// the admin panel render, and the full numbers only ever go in sealed.
const lastFour = (value: string): string | null => (value.length >= 4 ? value.slice(-4) : null);

// Save, or rewrite in place - the details id is stable per checkout, so a
// customer correcting a digit does not litter rows.
export async function saveCheckoutPayout(
  {
    user_id, existing_id, form,
  }: { user_id: string; existing_id: string | null; form: PayoutForm },
  executor?: Executor
): Promise<DetailRow> {
  const { method } = form;
  if (!method || !form.account_holder_name) {
    throw new Invalid("the payout needs a method and an account holder name");
  }
  if (BANK_METHODS.has(method)) {
    if (!form.routing_number || !form.account_number || !form.bank_name) {
      throw new Invalid(`${method} needs a bank name, a routing number and an account number`);
    }
    if (!/^\d{9}$/.test(form.routing_number)) {
      throw new Invalid("the routing number must be 9 digits");
    }
    if (!/^\d+$/.test(form.account_number)) {
      throw new Invalid("the account number must be digits");
    }
  } else if (EMAIL_METHODS.has(method)) {
    if (!form.payout_email) throw new Invalid(`${method} needs an email address`);
  } else {
    throw new Invalid(`no such payout method: ${method}`);
  }

  // A method that resolves to nothing writes nothing: an account with no
  // method is a payout with nowhere to go.
  const resolved = await methods.findByType("purchase", method, executor);
  if (!resolved) throw new Invalid(`no such payout method: ${method}`);

  const id = existing_id ?? randomUUID();
  const key = payoutKeyFromEnv();
  const account = form.account_number ?? "";
  const routing = form.routing_number ?? "";

  const values: DetailValues = {
    method_id: resolved.id,
    account_holder: cleared(form.account_holder_name),
    bank_name: cleared(form.bank_name),
    account_type: cleared(form.account_type),
    last_four: lastFour(account),
    routing_last_four: lastFour(routing),
    email_to: cleared(form.payout_email),
    routing_number_encrypted: routing
      ? seal(routing, key, aadFor(id, "routing_number"))
      : null,
    account_number_encrypted: account
      ? seal(account, key, aadFor(id, "account_number"))
      : null,
    encryption_key_id: BANK_METHODS.has(method) ? key.id : null,
  };

  if (existing_id) {
    const rewritten = await details.update(existing_id, values, executor);
    if (rewritten) {
      const row = await details.getOne(existing_id, executor);
      if (row) return row;
    }
  }
  return await details.create(id, user_id, values, executor);
}

// THE ADMIN READ'S SINGLE DOOR. Opens the envelopes for one details row, and
// answers null fields rather than throwing when a row carries none (an email
// method, or a pre-D210 row).
export async function decryptFor(
  details_id: string, executor?: Executor
): Promise<{
  method: string | null; account_holder: string | null; bank_name: string | null;
  account_type: string | null; email_to: string | null;
  routing_number: string | null; account_number: string | null;
} | null> {
  const row = await details.getSealed(details_id, executor);
  if (!row) return null;
  const method = row.method_id ? await methods.getOne(row.method_id, executor) : undefined;
  const key = payoutKeyFromEnv();
  const { account_holder, bank_name, account_type, email_to } = row;
  return {
    method: method?.type ?? null,
    account_holder,
    bank_name,
    account_type,
    email_to,
    routing_number: row.routing_number_encrypted
      ? open(row.routing_number_encrypted, key, aadFor(row.id, "routing_number"))
      : null,
    account_number: row.account_number_encrypted
      ? open(row.account_number_encrypted, key, aadFor(row.id, "account_number"))
      : null,
  };
}

// Change the method on one payout account. The account is reached by ITS OWN
// id: the walk from an order used to run through payments.intents, which is
// money coming IN, so it matched no rows for every payout it existed to serve
// (D168).
export async function setMethod(
  details_id: string, method: string, executor?: Executor
): Promise<boolean> {
  const resolved = await methods.findByType("purchase", method, executor);
  if (!resolved) throw new Invalid(`no such payout method: ${method}`);
  return await details.update(details_id, { method_id: resolved.id }, executor);
}
