// THE ORDER READ: an order on the wire is its orders.orders row plus `totals`
// and nothing else (Jacob). Two statements for any number of orders.
//
// read.service.ts still assembles a composed order for the API's OWN lifecycle
// work - pricing, the confirmation email, the PDFs. That is not a wire shape.
import * as ordersRepo from "#db/orders/repo.ts";
import * as transactions from "#domain/orders/transactions/service.ts";
import type { OrderRow } from "#db/orders/repo.ts";
import type { OrderTotalsRow } from "#domain/orders/transactions/service.ts";
import type { PoolClient } from "pg";

type Executor = PoolClient | undefined;

// `totals` is null for an order with no transactions row - a real state, and
// the contract declares it nullable for exactly those.
export type Order = OrderRow & { totals: OrderTotalsRow | null };

// Assigned onto the row rather than spread into a copy: the rows are this
// read's own and a copy is a second object to keep in step.
function attach(rows: OrderRow[], by: Map<string, OrderTotalsRow>): Order[] {
  const out: Order[] = [];
  for (const row of rows) {
    const order = row as Order;
    order.totals = by.get(row.id) ?? null;
    out.push(order);
  }
  return out;
}

export async function list(
  narrowing: { direction?: string | null; user_id?: string | null },
  executor?: Executor
): Promise<Order[]> {
  const rows = await ordersRepo.list(narrowing, executor);
  if (rows.length === 0) return [];
  return attach(rows, await transactions.byOrderId(rows.map((o) => o.id), executor));
}

export async function getOne(
  id: string, executor?: Executor
): Promise<Order | null> {
  const row = await ordersRepo.getOne(id, executor);
  if (!row) return null;
  return attach([row], await transactions.byOrderId([row.id], executor))[0];
}
