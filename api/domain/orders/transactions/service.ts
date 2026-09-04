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

export async function byOrderId(
  orderIds: string[], executor?: Executor
): Promise<Map<string, OrderTotals>> {
  const rows = await transactionsRepo.getMany(orderIds, executor);
  const by = new Map<string, OrderTotals>();
  for (const t of rows) if (t.order_id) by.set(t.order_id, t);
  return by;
}

export async function update(
  orderId: string,
  patch: OrderTotalsWrite,
  guard: { direction?: Direction } = {},
  executor?: Executor
): Promise<boolean> {
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
