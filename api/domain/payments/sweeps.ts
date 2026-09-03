// THE SAFETY NET UNDER CREATE-THEN-CHARGE, keyed by the INTENT: what happens
// when the webhook never arrives, and when the customer never pays.
//
// A sales order is born Pending - awaiting payment - and payment_intent.succeeded
// advances it. Webhooks go missing (production holds three settled intents the
// database never heard about), so "order awaiting a payment that already
// happened" WILL occur and this clears it. Its counterpart is the order whose
// payment never arrives, which after a TTL is cancelled with the credit that
// creation reserved put back.
//
// IT LIVES IN PAYMENTS, NOT ORDERS: every decision here is a payment fact (D211
// - statuses are flair), and the subject of each sweep is an intent. The order
// writes are the cosmetic consequence.
//
// NO HTTP SURFACE, BY DESIGN. Two consumers: scripts/reconcile-payments.ts, the
// operator's tool with report and --commit modes, and the cron scheduler, which
// runs ONLY the settled sweep - advancing a paid order moves no money and is
// idempotent, so it is safe on a timer; cancelling and refunding moves money, so
// it stays behind a human running --commit.
import * as orders from "#db/orders/repo.ts";
import * as usersService from "#domain/users/service.ts";
import * as transactionsService from "#domain/transactions/service.ts";
import withTransaction from "#shared/db/withTransaction.ts";
import * as paymentsService from "#domain/payments/service.ts";
import { reportError } from "#shared/observability/report.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { PoolClient } from "pg";

export type SettledSweepResult = { order_id: string; outcome: "advanced" };

/** Sweep (a): LABEL REPAIR for the missed webhook. Paidness is the intent row -
 *  already settled, nothing to decide - and the candidates are exactly the
 *  orders whose flair still contradicts it. Moves no money. */
export async function sweepSettledIntents(
  executor?: Executor
): Promise<SettledSweepResult[]> {
  const candidates = await orders.findSalesAwaitingSettledIntent(executor);
  const out: SettledSweepResult[] = [];
  for (const c of candidates) {
    // The flair, nothing else. No actor: a sweep is nobody, and the audit
    // trigger stamps a null actor as system (migration 116).
    await orders.update(c.order_id, { status: "Preparing" }, {}, executor);
    out.push({ order_id: c.order_id, outcome: "advanced" });
  }
  return out;
}

export type AbandonedSweepResult = {
  order_id: string;
  refunded: number;
};

/** Cancel ONE unpaid sale and put back the credit its creation reserved. The
 *  shared mechanics of two callers: the abandonment sweep below, and placement
 *  SUPERSEDING a customer's own unpaid order when they abandon checkout and
 *  come back.
 *
 *  EVERY DECISION IS A PAYMENT FACT: the CALLER establishes unpaidness from the
 *  intent before calling; the refund guards on the LEDGER - a Credit already
 *  logged for this order means the money already went back, whatever any label
 *  says; the Cancelled label is then written unconditionally, as flair. */
export async function cancelPendingSale(
  order_id: string, client: Executor
): Promise<AbandonedSweepResult> {
  await orders.update(order_id, { status: "Cancelled" }, {}, client);

  const money = await orders.findReservedFunds(order_id, client);
  const reserved = Number(money?.reserved_funds ?? 0);
  if (
    money?.used_funds && reserved > 0 && money.user_id &&
    !(await transactionsService.hasCreditFor(order_id, client))
  ) {
    await usersService.addFunds(money.user_id, reserved, client);
    await transactionsService.addTransactionLog(
      money.user_id, "Credit", null, order_id, reserved, client
    );
    return { order_id, refunded: reserved };
  }
  return { order_id, refunded: 0 };
}

/** Sweep (b): orders that awaited payment past the TTL with an intent that was
 *  never confirmed. Cancels, and puts back the credit creation reserved - each
 *  order in its own transaction, so one failure does not strand the rest.
 *
 *  MOVES MONEY. The caller decides when this runs; nothing schedules it. */
export async function sweepAbandoned(
  ttl_hours: number, executor?: Executor
): Promise<AbandonedSweepResult[]> {
  const candidates = await orders.findAbandonedSales(ttl_hours, executor);
  const out: AbandonedSweepResult[] = [];

  for (const c of candidates) {
    // Per-candidate isolation: one order's failure must not strand the rest.
    try {
      // The intent is CANCELLED FIRST and persisted - that row is the durable
      // swept fact the candidate query excludes next run. Outside the
      // transaction, because a Stripe call cannot be rolled back; if the
      // database half then fails, the next sweep still skips this order by the
      // cancelled intent, and the refund guard keeps the money right.
      if (c.payment_intent_id) {
        await paymentsService.cancelIntentByRef(c.payment_intent_id);
      }
      const result = executor
        ? await cancelPendingSale(c.order_id, executor)
        : await withTransaction((client: PoolClient) => cancelPendingSale(c.order_id, client));
      out.push(result);
    } catch (err) {
      reportError({
        at: "payments.sweepAbandoned",
        message: `sweeping order ${c.order_id} failed - continuing with the rest`,
        err,
        extra: { order_id: c.order_id },
      });
    }
  }
  return out;
}
