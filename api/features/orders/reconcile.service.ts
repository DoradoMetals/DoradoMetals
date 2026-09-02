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
import * as legacySales from "#legacy/sales-orders/repo.ts";
import { markSalesOrderPaid } from "#features/orders/paid.service.ts";
import * as usersService from "#features/users/service.ts";
import * as transactionsService from "#features/transactions/service.ts";
import withTransaction from "#shared/db/withTransaction.ts";
import { reportError } from "#shared/observability/report.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { PoolClient } from "pg";

export type SettledSweepResult = { order_id: string; outcome: "advanced" | "already" };

/** Sweep (a): orders awaiting a payment that already settled - the missed
 *  webhook. Advancing is idempotent and moves no money. */
export async function sweepSettledIntents(
  executor?: Executor
): Promise<SettledSweepResult[]> {
  const candidates = await orders.findSalesAwaitingSettledIntent(executor);
  const out: SettledSweepResult[] = [];
  for (const c of candidates) {
    out.push({ order_id: c.order_id, outcome: await markSalesOrderPaid(c.order_id, executor) });
  }
  return out;
}

export type AbandonedSweepResult = {
  order_id: string;
  refunded: number;
};

/** Cancel ONE Pending sale and put back the credit its creation reserved.
 *  The shared mechanics of two callers: the abandonment sweep below, and
 *  createSalesOrder SUPERSEDING a customer's own unpaid order when they
 *  abandon checkout and come back - their intent is still attached to the old
 *  order, and refusing them for 24 hours until the sweep clears it would
 *  strand exactly the person trying to give the business money.
 *  Returns null when the order was not Pending any more (somebody else moved
 *  it first), which callers treat as "not mine to touch". */
export async function cancelPendingSale(
  order_id: string, by: string, client: Executor
): Promise<AbandonedSweepResult | null> {
  const native = await orders.update(
    order_id, { status: "Cancelled", updated_by: by },
    { status: "Pending", direction: "sale" }, client
  );
  const legacy = await legacySales.markAbandoned(order_id, by, client);
  if (Boolean(native) !== Boolean(legacy)) {
    reportError({
      at: "orders.cancelPendingSale",
      message:
        `the two schemas disagree cancelling order ${order_id}: native ` +
        `${native ? "cancelled" : "did not"} and exchange ${legacy ? "cancelled" : "did not"}`,
      extra: { order_id, by },
    });
  }
  if (!native && !legacy) return null;

  const money = await orders.findReservedFunds(order_id, client);
  const reserved = Number(money?.reserved_funds ?? 0);
  if (money?.used_funds && reserved > 0 && money.user_id) {
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
    const result = executor
      ? await cancelPendingSale(c.order_id, "reconciler", executor)
      : await withTransaction((client: PoolClient) => cancelPendingSale(c.order_id, "reconciler", client));
    if (result) out.push(result);
  }
  return out;
}
