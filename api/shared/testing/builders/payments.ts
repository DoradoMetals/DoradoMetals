import type { PoolClient } from "pg";
import { anId, aTag } from "#shared/testing/builders/ids.ts";
import * as details from "#db/payments/details/repo.ts";
import * as intents from "#db/payments/intents/repo.ts";
import * as totals from "#db/orders/transactions/repo.ts";
import { seal, aadFor } from "#shared/crypto/envelope.ts";
import { payoutKeyFromEnv } from "#shared/crypto/payoutKey.ts";
import { paymentMethodId } from "#shared/testing/builders/reference.ts";
import type { BuiltUser } from "#shared/testing/builders/users.ts";
import type { BuiltOrder } from "#shared/testing/builders/orders.ts";
import type { PaymentDetailsPatch, PaymentIntentPatch } from "@dorado/contracts";

export const TEST_ROUTING = "021000021";
export const TEST_ACCOUNT = "000123456789";

export type BuiltPayout = {
  id: string;
  user_id: string;
  method: string;
  account_holder: string;
  last_four: string;
  routing_number: string;
  account_number: string;
};

type PayoutExtras = {
  method?: string;
  routing_number?: string;
  account_number?: string;
  order?: BuiltOrder | { id: string } | null;
  payout_fee?: number;
};

export async function aPayout(
  c: PoolClient,
  user: BuiltUser | { id: string },
  options: Partial<PaymentDetailsPatch> & PayoutExtras = {}
): Promise<BuiltPayout> {
  const id = options.id ?? anId();
  const method = options.method ?? "ACH";
  const method_id = await paymentMethodId(c, method, "purchase");
  const routing_number = options.routing_number ?? TEST_ROUTING;
  const account_number = options.account_number ?? TEST_ACCOUNT;
  const account_holder = options.account_holder ?? `Test Holder ${aTag()}`;
  const key = payoutKeyFromEnv();

  await details.create(
    id, user.id,
    {
      method_id,
      account_holder,
      bank_name: options.bank_name ?? "Test Bank",
      account_type: options.account_type ?? "Checking",
      last_four: account_number.slice(-4),
      routing_last_four: routing_number.slice(-4),
      email_to: options.email_to ?? null,
      routing_number_encrypted: seal(routing_number, key, aadFor(id, "routing_number")),
      account_number_encrypted: seal(account_number, key, aadFor(id, "account_number")),
      encryption_key_id: key.id,
    },
    c
  );

  if (options.order) {
    const existing = await totals.getFor(options.order.id, c);
    if (existing) {
      await totals.update(
        options.order.id,
        { payout_details_id: id, payout_fee: options.payout_fee ?? 0 },
        {},
        c
      );
    } else {
      await totals.create(
        {
          order_id: options.order.id,
          payout_details_id: id, payout_fee: options.payout_fee ?? 0,
        },
        c
      );
    }
  }

  return {
    id, user_id: user.id, method, account_holder,
    last_four: account_number.slice(-4), routing_number, account_number,
  };
}

export async function aPaymentIntent(
  c: PoolClient,
  user: BuiltUser | { id: string } | null,
  options: Partial<PaymentIntentPatch> & { order?: BuiltOrder | { id: string } | null } = {}
) {
  return intents.create(
    {
      id: options.id ?? anId(),
      session_id: options.session_id ?? anId(),
      user_id: user?.id ?? null,
      type: options.type ?? "order",
      status: options.status ?? "requires_payment_method",
      amount_expected: options.amount_expected ?? 100,
      order_id: options.order?.id ?? null,
      details_id: options.details_id ?? null,
      method_id: options.method_id ?? null,
    },
    c
  );
}
