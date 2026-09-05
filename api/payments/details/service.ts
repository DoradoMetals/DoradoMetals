import withTransaction from "#shared/db/withTransaction.ts";
import { paymentDetails as details, paymentMethods as methods } from "#db";
import * as orderTransactions from "#orders/transactions/service.ts";
import {
  assertNamesAField, assertPayableForm, assertPayout, assertResolvedMethod,
  assertWaivable, assertWritablePayout, assertWrittenDetails, cleared,
  isBankMethod, lastFour,
} from "#payments/details/rules.ts";
import { seal, open, aadFor } from "#shared/crypto/envelope.ts";
import { payoutKeyFromEnv } from "#shared/crypto/payoutKey.ts";
import { withDecisions } from "#shared/views.ts";
import type { Executor } from "#shared/db/executor.ts";
import type {
  CheckoutPayoutForm, PaymentDetailsBank, PaymentDetailsPatch, PaymentDetailsView,
  PaymentDetailsWrite,
} from "@dorado/contracts";

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

  const key = payoutKeyFromEnv();
  const account = form.account_number ?? "";
  const routing = form.routing_number ?? "";

  const base: PaymentDetailsWrite = {
    method_id: resolved.id,
    account_holder: cleared(form.account_holder_name),
    bank_name: cleared(form.bank_name),
    account_type: cleared(form.account_type),
    last_four: lastFour(account),
    routing_last_four: lastFour(routing),
    email_to: cleared(form.payout_email),
    encryption_key_id: isBankMethod(method) ? key.id : null,
  };

  // The envelope's AAD is the row's own id, so the row has to exist before the
  // numbers can be sealed. Two writes, each naming only the columns it owns -
  // `buildUpdate` leaves out what is not in the patch (ruling 78: no spreading
  // one write's shape into the next).
  const id = existing_id ?? (await details.create(user_id, base, tx)).id;
  if (existing_id) assertWrittenDetails(id, await details.update(id, base, tx));

  const sealed: PaymentDetailsWrite = {
    routing_number_encrypted: routing
      ? seal(routing, key, aadFor(id, "routing_number"))
      : null,
    account_number_encrypted: account
      ? seal(account, key, aadFor(id, "account_number"))
      : null,
  };

  return assertWrittenDetails(id, await details.update(id, sealed, tx));
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

export async function getOne(id: string): Promise<PaymentDetailsView | undefined> {
  return await details.getOne(id);
}

export async function getForOrder(order_id: string): Promise<PaymentDetailsView[]> {
  return await details.getMany([order_id]);
}

export async function getBank(id: string): Promise<PaymentDetailsBank | undefined> {
  const view = await details.getOne(id);
  if (!view) return undefined;
  return withDecisions(view, await decryptFor(id));
}

export async function patchDetails(
  details_id: string, patch: PaymentDetailsPatch
): Promise<PaymentDetailsView> {
  assertNamesAField(patch);

  return await withTransaction(async (tx) => {
    const order_id = assertWritablePayout(
      details_id, await details.getOne(details_id, tx)
    );

    if (patch.cost !== undefined) {
      await orderTransactions.update(order_id, { payout_fee: patch.cost }, {}, tx);
    }

    if (patch.method !== undefined) {
      await setMethod(details_id, patch.method, tx);
    }

    if (patch.waive_payout_fee !== undefined) {
      const written = await orderTransactions.update(
        order_id,
        { waive_payout_fee: patch.waive_payout_fee },
        { direction: "purchase" },
        tx
      );
      assertWaivable(details_id, written);
    }

    return assertPayout(details_id, await details.getOne(details_id, tx));
  });
}
