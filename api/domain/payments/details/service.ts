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

  const rewritten = existing_id ? await details.update(existing_id, values, tx) : undefined;
  return rewritten ?? (await details.create(id, user_id, values, tx));
}

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
