// Credit a purchase order's total to the customer's balance.
import * as usersFunds from "#domain/users/service.ts";
import * as transactionsService from "#domain/transactions/service.ts";
import withTransaction from "#shared/db/withTransaction.ts";
import { reportError } from "#shared/observability/report.ts";

export async function addFundsToAccount({
  order,
}: {
  order: { id: string; user_id: string | null; totals?: { total?: number | null } | null };
}): Promise<void> {
  // THE LEDGER MUST RECORD WHAT WAS ACTUALLY CREDITED. One figure, read once:
  // logging a separately computed number is how nine production Credit entries
  // came to disagree with the orders they explain.
  const amount = order.totals?.total ?? null;
  try {
    await withTransaction(async (client) => {
      await usersFunds.addFunds(order.user_id, amount, client);
      await transactionsService.addTransactionLog(
        order.user_id, "Credit", order.id, null, amount, client
      );
    });
  } catch (err) {
    reportError({
      at: "orders.addFundsToAccount",
      message: `crediting order ${order.id} failed - no funds moved`,
      err,
      extra: { order_id: order.id },
    });
    throw err;
  }
}
