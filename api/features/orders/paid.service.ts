// The one write that says a sales order's payment has settled.
//
// Phase 9 (create-then-charge) made "Pending" mean AWAITING PAYMENT for sales
// orders, so something has to advance them when the money arrives. Two callers:
// the payment_intent.succeeded webhook, and reconcile:payments sweeping the
// webhooks that never landed (production has had three - audit:payments).
//
// *** ITS OWN MODULE, NOT service.ts, TO BREAK AN IMPORT CYCLE. *** The caller
// is features/payments/service.ts, and features/orders/service.ts imports
// payments (PaymentSession, the repo facade). payments -> orders/service would
// close a runtime cycle; payments -> THIS file imports only the two repos and
// cycles with nothing.
//
// *** BOTH SCHEMAS, COMPARED, REPORTED (D202). *** The advance is conditional -
// only from Pending - so a retry is a zero-row no-op on both halves, which is
// fine. The halves DISAGREEING is not fine: that is one schema recording a paid
// order the other still shows unpaid, and it is exactly the divergence the
// dual-write era exists to prevent.
import * as orders from "#features/orders/repo.ts";
import * as legacySales from "#legacy/sales-orders/repo.ts";
import { reportError } from "#shared/observability/report.ts";
import type { Executor } from "#shared/db/executor.ts";

/**
 * Advance a Pending sales order to Preparing because its payment settled.
 * Idempotent: returns "advanced" the first time, "already" on any retry or
 * when an admin has since moved the label somewhere else.
 */
export async function markSalesOrderPaid(
  order_id: string, executor?: Executor
): Promise<"advanced" | "already"> {
  const native = await orders.markSalePaid(order_id, "payment", executor);
  const legacy = await legacySales.markPaid(order_id, "payment", executor);

  if (Boolean(native) !== Boolean(legacy)) {
    reportError({
      at: "orders.markSalesOrderPaid",
      message:
        `the two schemas disagree about order ${order_id}: native ` +
        `${native ? "advanced" : "did not advance"} and exchange ` +
        `${legacy ? "advanced" : "did not"} - one of them now shows a paid ` +
        `order as unpaid`,
      extra: { order_id, native: Boolean(native), legacy: Boolean(legacy) },
    });
  }
  return native || legacy ? "advanced" : "already";
}
