// aPayout and aPaymentIntent - the money rows.
//
// *** aPayout IS payments.details, NOT exchange.payouts. *** The old table
// still HOLDS 24 plaintext bank numbers and is read by the admin surfaces, but
// it receives nothing new (D210): a new-flow payout account is an AES-256-GCM
// envelope in `payments.details`, linked from `orders.transactions.
// payout_details_id`. A builder that wrote the old table would be building a
// row the live code cannot produce.
//
// *** THE NUMBERS ARE SEALED THE SAME WAY THE SERVICE SEALS THEM. *** Same
// cipher, same additional-authenticated-data (the row id and the column name),
// so a test that opens one is testing the real envelope and not a fixture's
// imitation of one. The digits are obviously fake and constant, because a
// failure message naming 021000021 is readable and a random one is not.
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

// A test routing number and a test account number. Constant on purpose.
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

export type PayoutOptions = {
  id?: string;
  method?: string;
  account_holder?: string;
  bank_name?: string;
  account_type?: string;
  routing_number?: string;
  account_number?: string;
  email_to?: string | null;
  // Link it to an order's money row, the way the placement does.
  order?: BuiltOrder | { id: string } | null;
  payout_fee?: number;
};

export async function aPayout(
  c: PoolClient, user: BuiltUser | { id: string }, options: PayoutOptions = {}
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
    // The link lives on the ORDER's money row, so it is written there - and
    // through the same update the placement uses.
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
          id: anId(), order_id: options.order.id,
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

export type IntentOptions = {
  id?: string;
  type?: string;
  status?: string;
  amount_expected?: number | null;
  session_id?: string | null;
  order?: BuiltOrder | { id: string } | null;
  details_id?: string | null;
  method_id?: string | null;
};

export async function aPaymentIntent(
  c: PoolClient, user: BuiltUser | { id: string } | null, options: IntentOptions = {}
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
