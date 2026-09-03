// THE ORDER READ, and it is two statements.
//
// An order on the wire is its orders.orders row plus `totals` - the
// orders.transactions row that is the order's own money - and nothing else
// (Jacob, wave 3). Everything a drawer used to read off a nested slot is its
// own parent-path read of its own table; see wire/orders.ts for the family.
//
// WHAT THIS REPLACED, and the reason it is worth stating: the per-direction
// read services issued nine statements per answer and assembled six nested
// objects - products, metals, refiner items, payouts, users, address book,
// plus a shipment and a pickup query PER ORDER inside a loop. Thirty orders
// cost sixty-odd round trips. This costs two, whether the answer is one order
// or every one.
//
// The composed read services did not die with it. They are the API's OWN
// lifecycle read - pricing, the confirmation email, the PDFs - which
// genuinely needs an order assembled. They are internal, and no longer a wire
// shape; features/orders/read.service.ts says so in its header.
import * as ordersRepo from "#db/orders/repo.ts";
import * as transactions from "#domain/orders/transactions/service.ts";
import type { OrderRow } from "#db/orders/repo.ts";
import type { OrderTotalsRow } from "#domain/orders/transactions/service.ts";
import type { PoolClient } from "pg";

type Executor = PoolClient | undefined;

// `totals` is null for an order whose transactions row does not exist. That is
// a real state rather than a defect - the strays clean:dual-orphans removes -
// and the contract declares it nullable for exactly those.
export type Order = OrderRow & { totals: OrderTotalsRow | null };

function attach(orders: OrderRow[], by: Map<string, OrderTotalsRow>): Order[] {
  return orders.map((o) => ({ ...o, totals: by.get(o.id) ?? null }));
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
