// The payout account: recorded at the payout STEP (D210), linked at order
// creation, opened only by the admin bank-details read.
//
// ROUTING AND ACCOUNT NUMBERS ARE SEALED HERE - AES-256-GCM envelopes bound to
// the row id and the column name (shared/crypto/envelope.ts), so a copied
// envelope fails authentication anywhere but its own cell. Plaintext exists
// only inside this module's two functions and never reaches a log, an error or
// a return value except from decryptFor, the admin read's single door.
import { randomUUID } from "node:crypto";
import { paymentDetails as details, paymentMethods as methods } from "#db";
import {
  assertPayableForm, assertResolvedMethod, assertWrittenDetails, cleared,
  isBankMethod, lastFour,
} from "#domain/payments/details/rules.ts";
import { seal, open, aadFor } from "#shared/crypto/envelope.ts";
import { payoutKeyFromEnv } from "#shared/crypto/payoutKey.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { CheckoutPayoutForm, PaymentDetailsPatch, PaymentDetailsView } from "@dorado/contracts";

// Save, or rewrite in place - the details id is stable per checkout, so a
// customer correcting a digit does not litter rows.
//
// LOAD (the method row the form names) -> ASSERT (rules.ts) -> WRITE. `tx` is
// REQUIRED and the caller's: the account is written inside the checkout's own
// transaction, so a payout step that fails writes no half-account.
export async function saveCheckoutPayout(
  user_id: string,
  existing_id: string | null,
  form: CheckoutPayoutForm,
  tx: Executor
): Promise<PaymentDetailsView> {
  const method = assertPayableForm(form);

  const resolved = assertResolvedMethod(
    method, await methods.findByType("purchase", method, tx)
  );

  const id = existing_id ?? randomUUID();
  const key = payoutKeyFromEnv();
  const account = form.account_number ?? "";
  const routing = form.routing_number ?? "";

  const values: PaymentDetailsPatch = {
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
    encryption_key_id: isBankMethod(method) ? key.id : null,
  };

  // THE UPDATE ANSWERS THE ROW IT WROTE (ruling 65). It used to write, ask
  // whether one row changed, then read the row back - three statements to
  // learn what the first one already knew, and a window in which the answer
  // could disagree with the write it followed.
  const rewritten = existing_id ? await details.update(existing_id, values, tx) : undefined;
  return rewritten ?? (await details.create(id, user_id, values, tx));
}

// THE ADMIN READ'S SINGLE DOOR, and it answers the two numbers and nothing
// else. It used to hand back the account facts beside them - method, holder,
// bank, type, email - which its one caller already had from the payout
// projection and discarded, so every field but these two was plaintext-adjacent
// surface with no reader at all.
//
// Nulls rather than a throw when a row carries no envelopes: an email method
// and a pre-D210 row both legitimately have none.
export async function decryptFor(
  details_id: string, executor?: Executor
): Promise<{ routing_number: string | null; account_number: string | null }> {
  const row = await details.getSealed(details_id, executor);
  if (!row) return { routing_number: null, account_number: null };
  const key = payoutKeyFromEnv();
  return {
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
// (D168). `tx` is REQUIRED - the payout patch writes two tables and they
// commit together or not at all.
export async function setMethod(
  details_id: string, method: string, tx: Executor
): Promise<void> {
  const resolved = assertResolvedMethod(
    method, await methods.findByType("purchase", method, tx)
  );
  assertWrittenDetails(
    details_id, await details.update(details_id, { method_id: resolved.id }, tx)
  );
}
