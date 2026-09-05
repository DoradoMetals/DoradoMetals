import { reportError } from "#shared/observability/report.ts";
import * as transactionsRepo from "#db/orders/transactions/repo.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { OrderTotalsGuard, OrderTotalsWrite } from "@dorado/contracts";

export type { OrderTotals, OrderTotalsWrite } from "@dorado/contracts";

export async function update(
  orderId: string,
  patch: OrderTotalsWrite,
  guard: OrderTotalsGuard = {},
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
