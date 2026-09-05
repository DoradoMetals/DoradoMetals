import withTransaction from "#shared/db/withTransaction.ts";
import * as stripe from "#providers/payment/stripe.ts";
import {
  paymentIntents as intents, paymentAttempts as attempts,
  paymentSettlements as settlements, paymentCustomers as customers,
} from "#db";
import { users as usersService } from "#domain";
import * as checkoutService from "#domain/checkout/service.ts";
import * as pricing from "#domain/pricing/index.ts";
import {
  toDollars, intentOwner, isOpen, isResolved, chargeCents, isChargeable,
  assertBillingIdentity, assertIntentSubject, assertPriceableBalance,
} from "#domain/payments/rules.ts";

import type { StripeIntentLike } from "#providers/payment/stripe.ts";
import type { PaymentIntentView, PaymentIntentFacts, PaymentCaller } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";
import type { UpdatePaymentIntentBody } from "@dorado/contracts";

async function findReusableIntent(
  caller: PaymentCaller, type: string | undefined, named_user_id: string | undefined,
  executor?: Executor
): Promise<PaymentIntentView | undefined> {
  return await intents.findReusable(
    caller.session_id,
    intentOwner(type, caller.user_id, named_user_id),
    type ?? null,
    executor
  );
}

export async function retrievePaymentIntent(
  caller: PaymentCaller, type: string | undefined, user_id: string | undefined
): Promise<StripeIntentLike> {
  const open = await findReusableIntent(caller, type, user_id);
  if (open?.attempt?.provider_ref) return await stripe.retrieveIntent(open.attempt.provider_ref);
  return await createPaymentIntent(caller, type, user_id);
}

async function billingIdentity(
  caller: PaymentCaller, type: string | undefined, user_id: string | undefined
) {
  const subject = type === "admin" ? user_id : caller.user_id;
  return assertBillingIdentity(subject ? await customers.getOne(subject) : undefined, type);
}

export async function createPaymentIntent(
  caller: PaymentCaller, type: string | undefined, user_id: string | undefined
): Promise<StripeIntentLike> {
  const target = await billingIdentity(caller, type, user_id);

  let customerId = target.stripeCustomerId;
  if (!customerId) {
    const created = await stripe.createCustomer({ name: target.name, email: target.email });
    customerId = created.id;
    await customers.update(target.id, { [customers.STRIPE_CUSTOMER]: customerId });
  }

  const existing = await findReusableIntent(caller, type, user_id);
  if (existing?.attempt?.provider_ref) {
    return await stripe.retrieveIntent(existing.attempt.provider_ref);
  }

  const paymentIntent = await stripe.createIntent({
    amount: 1000,
    customerId,
    metadata: {
      type: String(type),
      user_id: String(target.id),
      session_id: caller.session_id,
    },
    idempotencyKey: `intent:${type}:${target.id}:${caller.session_id}`,
  });

  await withTransaction((tx) => recordIntent(paymentIntent, caller, type, user_id, tx));
  return paymentIntent;
}

export async function recordIntent(
  paymentIntent: StripeIntentLike,
  caller: PaymentCaller,
  type: string | undefined,
  user_id: string | undefined,
  tx: Executor
): Promise<void> {
  const amount_expected = toDollars(paymentIntent.amount);

  const { id: intent_id } = await intents.create(
    {
      session_id: caller.session_id,
      user_id: intentOwner(type, caller.user_id, user_id),
      type: type ?? null,
      status: paymentIntent.status ?? null,
      amount_expected,
    },
    tx
  );
  await attempts.create(
    {
      id: intent_id,
      intent_id,
      provider: "stripe",
      provider_ref: paymentIntent.id,
      amount: amount_expected,
      status: paymentIntent.status ?? null,
    },
    tx
  );
}

export async function updateFromProvider(
  paymentIntent: StripeIntentLike, tx: Executor
): Promise<boolean> {
  const attempt = await attempts.findByProviderRef(paymentIntent.id, tx);
  if (!attempt) return false;
  const { id: attempt_id, intent_id } = attempt;

  const { status, amount_received } = paymentIntent;
  const amount_expected = toDollars(paymentIntent.amount);

  const matched = await intents.update(
    intent_id, { status: status ?? undefined, amount_expected }, tx
  );
  if (!matched) return false;
  await attempts.update(
    attempt_id, { status: status ?? undefined, amount: amount_expected }, tx
  );

  if ((amount_received ?? 0) > 0) {
    await settlements.create(
      attempt_id, attempt_id,
      {
        settled_amount: toDollars(amount_received) as number,
        provider: "stripe",
        provider_ref: paymentIntent.id,
      },
      tx
    );
  }
  return true;
}

export async function findIntentByRef(
  provider_ref: string, executor?: Executor
): Promise<PaymentIntentFacts | undefined> {
  return await intents.findFactsByRef(provider_ref, executor);
}

export async function attachOrder(
  provider_ref: string, order_id: string | null, executor?: Executor
): Promise<boolean> {
  const attempt = await attempts.findByProviderRef(provider_ref, executor);
  if (!attempt) return false;
  return await intents.update(attempt.intent_id, { order_id }, executor);
}

export async function updatePaymentIntent(
  caller: PaymentCaller,
  { user_id, type }: UpdatePaymentIntentBody
): Promise<StripeIntentLike> {
  const subject = assertIntentSubject(type === "admin" ? user_id : caller.user_id);

  assertPriceableBalance(subject, await usersService.getBalance(subject));

  const retrieved_intent = await findReusableIntent(caller, type, user_id);

  const basket = await checkoutService.getRowFor(subject, "sale");
  const quote = await pricing.priceCheckout(basket.id);
  const amount = chargeCents(quote.direction === "sale" ? quote.post_charges_amount : 0);

  if (!isChargeable(amount)) {
    return retrieved_intent?.attempt?.provider_ref
      ? await stripe.retrieveIntent(retrieved_intent.attempt.provider_ref)
      : await createPaymentIntent(caller, type, user_id);
  }

  const provider_ref = retrieved_intent?.attempt?.provider_ref;
  if (!provider_ref || !isOpen(retrieved_intent?.status)) {
    return await createPaymentIntent(caller, type, user_id);
  }

  const live = await stripe.retrieveIntent(provider_ref);
  await withTransaction((tx) => updateFromProvider(live, tx));
  if (isResolved(live.status)) return await createPaymentIntent(caller, type, user_id);

  const paymentIntent = await stripe.updateIntent(provider_ref, { amount });
  await withTransaction((tx) => updateFromProvider(paymentIntent, tx));
  return paymentIntent;
}

export async function cancelPaymentIntent(payment_intent_id: string): Promise<StripeIntentLike> {
  const paymentIntent = await stripe.cancelIntent(payment_intent_id);
  await withTransaction((tx) => updateFromProvider(paymentIntent, tx));
  return paymentIntent;
}

export async function cancelIntentByRef(provider_ref: string): Promise<void> {
  const canceled = await stripe.cancelIntent(provider_ref);
  await withTransaction((tx) => updateFromProvider(canceled, tx));
}

export async function getPaymentIntentFromSalesOrderId(
  order_id: string
): Promise<PaymentIntentView | undefined> {
  return await intents.findForOrder(order_id);
}
