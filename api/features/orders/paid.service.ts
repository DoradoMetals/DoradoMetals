// The FLAIR refresh when a sales order's payment settles.
//
// *** STATUSES DRIVE NO LOGIC (D211 - Jacob: "they're simply flair"). ***
// Whether an order is PAID is a payment-table fact - the intent's own status,
// or nothing left to charge - and every decision reads that fact. This write
// is cosmetic: it stamps the label a paid order displays, unconditionally.
// The no-stomp property moved to where it belongs: the PAYMENTS layer calls
// this only on a real settlement TRANSITION (the stored intent was not
// succeeded before this webhook), so a Stripe retry never reaches here and an
// admin's later label survives - by fact, not by a status guard.
//
// *** ITS OWN MODULE, NOT service.ts, TO BREAK AN IMPORT CYCLE. *** The caller
// is features/payments/service.ts, and features/orders/service.ts imports
// payments. payments -> THIS file imports only the two repos and cycles with
// nothing.
import * as orders from "#features/orders/repo.ts";
import * as legacySales from "#legacy/sales-orders/repo.ts";
import type { Executor } from "#shared/db/executor.ts";

export async function refreshPaidFlair(
  order_id: string, executor?: Executor
): Promise<void> {
  await orders.update(
    order_id, { status: "Preparing", updated_by: "payment" }, {}, executor
  );
  await legacySales.setStatus(order_id, "Preparing", "payment", executor);
}
