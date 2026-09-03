// THE ORDER'S OWN MONEY: orders.transactions.
//
// NO routes.ts AND NO controller.ts, and that is a decision rather than an
// omission (the same one fulfillments/shipments records). Ruling 26c gives
// every resource its own stack so a consumer can depend on one resource
// without depending on its parent; this resource has no HTTP surface, because
// the order's money is served AS PART OF the order - `totals` on the
// orders.orders row - and every write to it is an operation of some other
// endpoint (the shipment's charge, the payout's fee, the refiner's fee).
// The day one of those becomes a resource read, the two files go here beside
// this one and the parent mounts them.
//
// Ruling 7 notes this table may not need to exist at all once payments and the
// funds ledger settle. That is a note, not a plan - and it is a reason for the
// domain logic to be in one file rather than smeared across its callers.
import { reportError } from "#shared/observability/report.ts";
import * as transactionsRepo from "#db/orders/transactions/repo.ts";
import type { OrderTotalsRow, TotalsPatch, TotalsGuard } from "#db/orders/transactions/repo.ts";
import type { PoolClient } from "pg";

type Executor = PoolClient | undefined;

export type { OrderTotalsRow, TotalsPatch, TotalsGuard } from "#db/orders/transactions/repo.ts";

export async function forOrder(
  orderId: string, executor?: Executor
): Promise<OrderTotalsRow | undefined> {
  return await transactionsRepo.getFor(orderId, executor);
}

// The totals for a set of orders, as a lookup. ONE STATEMENT for any number of
// orders - the shape the list read needs, and the reason it costs two round
// trips rather than one per order.
export async function byOrderId(
  orderIds: string[], executor?: Executor
): Promise<Map<string, OrderTotalsRow>> {
  const rows = await transactionsRepo.getMany(orderIds, executor);
  // order_id is nullable on the generated row type (the column allows it, and
  // clean:dual-orphans exists because strays happen). A row with no order can
  // be keyed by nothing, so it is dropped rather than filed under "null".
  const by = new Map<string, OrderTotalsRow>();
  for (const t of rows) if (t.order_id) by.set(t.order_id, t);
  return by;
}

// ONE UPDATE (Jacob, 2026-09-02): the patch object names the columns, the
// repo builds the statement, and every admin money edit comes through here.
export async function update(
  orderId: string,
  patch: TotalsPatch,
  guard: TotalsGuard = {},
  executor?: Executor
): Promise<OrderTotalsRow | undefined> {
  // ZERO ROWS HERE IS A LOST MONEY EDIT, AND IT USED TO BE SILENT.
  //
  // The statement is `WHERE order_id = ...` against orders.transactions, and
  // that row is not guaranteed to exist: measured on dev, 5 of 21 PURCHASE
  // orders have no orders.transactions row at all - and purchase orders are
  // exactly the ones carrying refiner_fee, payout_fee, shipping_actual and the
  // pool columns. So an admin adjusting a fee on one of those changed nothing
  // and was told it worked. D202.
  //
  // Reported rather than thrown: the order legitimately has no row yet, and
  // refusing the edit is louder without being better. The real fix is an upsert
  // and it is a schema-shaped decision (D202). This makes the loss visible in
  // the meantime. A GUARDED miss is not reported: the guard failing to match
  // is the answer the caller asked for, and the caller reads it off the
  // undefined return.
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
