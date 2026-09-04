// THE ORDER'S OWN MONEY: orders.transactions.
//
// NO routes.ts AND NO controller.ts, deliberately: the money is served AS PART
// OF the order (`totals`), and every write to it is another endpoint's
// operation - the shipment's charge, the payout's fee, the refiner's fee.
import { reportError } from "#shared/observability/report.ts";
import * as transactionsRepo from "#db/orders/transactions/repo.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { Direction, OrderTotals, OrderTotalsWrite } from "@dorado/contracts";


export type { OrderTotals, OrderTotalsWrite } from "@dorado/contracts";

export async function forOrder(
  orderId: string, executor?: Executor
): Promise<OrderTotals | undefined> {
  return await transactionsRepo.getFor(orderId, executor);
}

// ONE STATEMENT for any number of orders - why the list read costs two round
// trips rather than one per order.
export async function byOrderId(
  orderIds: string[], executor?: Executor
): Promise<Map<string, OrderTotals>> {
  const rows = await transactionsRepo.getMany(orderIds, executor);
  // order_id is nullable, and a row with no order can be keyed by nothing.
  const by = new Map<string, OrderTotals>();
  for (const t of rows) if (t.order_id) by.set(t.order_id, t);
  return by;
}

// ONE UPDATE: the patch names the columns and every money edit comes through it.
export async function update(
  orderId: string,
  patch: OrderTotalsWrite,
  guard: { direction?: Direction } = {},
  executor?: Executor
): Promise<boolean> {
  // ZERO ROWS HERE IS A LOST MONEY EDIT, AND IT USED TO BE SILENT: 5 of 21 dev
  // purchase orders have no orders.transactions row, and those are exactly the
  // ones carrying the fees an admin adjusts (D202).
  //
  // Reported rather than thrown - the row legitimately may not exist yet, and
  // the real fix is an upsert. A GUARDED miss is the answer the caller asked for.
  const written = await transactionsRepo.update(orderId, patch, guard, executor);
  if (!written && !Object.keys(guard).length) {
    reportError({
      at: "orders.transactions.update",
      message:
        `no orders.transactions row for order ${orderId} - the ` +
        `${Object.keys(patch).join(", ")} edit was NOT recorded and the ` +
        `caller was told it succeeded`,
      extra: { order_id: orderId, fields: Object.keys(patch).join(",") },
    });
  }
  return written;
}
