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
import * as transactionsRepo from "#features/orders/transactions/repo.ts";
import type { OrderTotalsRow, Amount } from "#features/orders/transactions/repo.ts";
import type { PoolClient } from "pg";

type Executor = PoolClient | undefined;

export { AMOUNTS } from "#features/orders/transactions/repo.ts";
export type { OrderTotalsRow, Amount } from "#features/orders/transactions/repo.ts";

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

// One of the amounts an admin adjusts. The column is named from the repo's
// closed set, never interpolated from a request.
export async function setAmount(
  orderId: string,
  field: Amount,
  value: number | null,
  by: string | null = null,
  executor?: Executor
): Promise<void> {
  await transactionsRepo.setAmount(orderId, field, value, by, executor);
}
