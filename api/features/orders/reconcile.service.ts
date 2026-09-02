// The safety net under create-then-charge: what happens when the webhook never
// arrives, and when the customer never pays.
//
// A sales order is born Pending - awaiting payment - and the
// payment_intent.succeeded webhook advances it. Webhooks go missing: production
// holds three settled intents the database never heard about (audit:payments,
// the $126.48 thread). So the state "order awaiting a payment that already
// happened" WILL occur, and this module is what clears it. Its counterpart is
// the order whose payment never arrives at all - abandoned checkout - which
// after a TTL is cancelled, with the credit that creation reserved put back.
//
// NO HTTP SURFACE, BY DESIGN (the layout rule: a resource with no HTTP surface
// gets a service and says so). Two consumers: scripts/reconcile-payments.ts,
// which is the operator's tool with report and --commit modes, and the cron
// scheduler, which runs ONLY the settled sweep - advancing a paid order moves
// no money and is idempotent, so it is safe on a timer; cancelling and
// refunding moves money, so it stays behind a human running --commit.
import * as orders from "#features/orders/repo.ts";
import * as usersService from "#features/users/service.ts";
import * as transactionsService from "#features/transactions/service.ts";
import withTransaction from "#shared/db/withTransaction.ts";
import * as paymentsService from "#features/payments/service.ts";
import { reportError } from "#shared/observability/report.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { PoolClient } from "pg";

export type SettledSweepResult = { order_id: string; outcome: "advanced" };

/** Sweep (a): LABEL REPAIR for the missed webhook (D211). Paidness is the
 *  intent row - already settled, nothing to decide - and the candidates are
 *  exactly the orders whose flair still contradicts it. Moves no money. */
export async function sweepSettledIntents(
  executor?: Executor
): Promise<SettledSweepResult[]> {
  const candidates = await orders.findSalesAwaitingSettledIntent(executor);
  const out: SettledSweepResult[] = [];
  for (const c of candidates) {
    // The flair, nothing else: paid is a payments FACT, "Preparing" is the label.
    await orders.update(c.order_id, { status: "Preparing", updated_by: "payment" }, {}, executor);
    out.push({ order_id: c.order_id, outcome: "advanced" });
  }
  return out;
}

export type AbandonedSweepResult = {
  order_id: string;
  refunded: number;
};

/** Cancel ONE unpaid sale and put back the credit its creation reserved.
 *  The shared mechanics of two callers: the abandonment sweep below, and
 *  createSalesOrder SUPERSEDING a customer's own unpaid order when they
 *  abandon checkout and come back.
 *
 *  EVERY DECISION HERE IS A PAYMENT FACT (D211 - statuses are flair):
 *  - the CALLER establishes unpaidness from the intent before calling (both
 *    callers already do - the sweep's candidate query and the supersede's
 *    own succeeded/processing refusal);
 *  - the refund guards on the LEDGER - a Credit already logged for this
 *    order means the money already went back, whatever any label says;
 *  - the Cancelled labels are then written unconditionally, as flair. */
export async function cancelPendingSale(
  order_id: string, by: string, client: Executor
): Promise<AbandonedSweepResult> {
  await orders.update(order_id, { status: "Cancelled", updated_by: by }, {}, client);

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
 *  never confirmed. Cancels, and puts back the credit creation reserved -
 *  each order in its own transaction, so one failure does not strand the rest.
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
      // swept-fact the candidate query excludes next run (D211). Outside the
      // transaction, because a Stripe call cannot be rolled back; if the
      // database half then fails, the next sweep still skips this order by
      // the cancelled intent, and the refund guard keeps the money right.
      if (c.payment_intent_id) {
        await paymentsService.cancelIntentByRef(c.payment_intent_id);
      }
      const result = executor
        ? await cancelPendingSale(c.order_id, "reconciler", executor)
        : await withTransaction((client: PoolClient) => cancelPendingSale(c.order_id, "reconciler", client));
      out.push(result);
    } catch (err) {
      reportError({
        at: "orders.sweepAbandoned",
        message: `sweeping order ${c.order_id} failed - continuing with the rest`,
        err,
        extra: { order_id: c.order_id },
      });
    }
  }
  return out;
}
