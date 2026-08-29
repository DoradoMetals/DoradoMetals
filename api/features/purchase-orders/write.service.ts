// Creating a purchase order: the new schema and exchange, in one transaction.
//
// THIS IS THE ONLY WRITE THIS FEATURE STILL OWNS. Every other write a purchase
// order needs - its status, its offer, its lines, its quoted spots, its money,
// the refiner's numbers, the shipping charge - belongs to the table it touches
// and is shared with sales orders. See repo.ts for the reasoning.
//
// EVERY FUNCTION TAKES THE CALLER'S EXECUTOR AND THREADS IT. An order is
// created inside a transaction that also writes its lines and its scrap; a
// write that opened its own connection would commit while the rest rolled back.
import { randomUUID } from "node:crypto";
import * as orders from "#features/purchase-orders/repo.ts";
import * as legacy from "#features/purchase-orders/legacy.repo.ts";
import * as refinerOrders from "#features/refiners/orders/repo.ts";
import type { Executor } from "#features/purchase-orders/repo.ts";

export type NewOrder = {
  userId: string;
  addressId: string | null;
  status: string;
  by?: string | null;
};

// THREE ROWS IN THE NEW SCHEMA, ONE IN EXCHANGE.
//
// The id is generated here so both schemas agree on it, and `number` comes back
// from the new-schema insert because it is drawn from exchange's sequence - the
// two share one numbering space while both are live.
//
// OFFERS ARE GONE (086). This used to create an empty offer row alongside the
// order, because exchange held the offer fields as columns on the order and the
// new schema had split them onto orders.offers. That table no longer exists;
// spots_locked moved to orders.orders and is written with the order itself.
export async function insertOrder(
  executor: Executor, { userId, addressId, status, by = null }: NewOrder
): Promise<string> {
  const id = randomUUID();

  // The number is drawn ONCE, by the new-schema insert, and handed to the
  // exchange half. Before this, exchange's column DEFAULT drew the shared
  // sequence a second time and the two schemas held different numbers for the
  // same order - the one find of the wave-1 parity ledger.
  const { number } = await orders.createOrder(id, userId, status, by, executor);
  await legacy.createOrder(id, userId, addressId, status, number, executor);

  // ONE ENGAGEMENT PER ORDER, EVERY ORDER (093). The order gets its
  // refiners.orders row at birth, values NULL until the refinery reports -
  // the invariant the backfill established, maintained for new traffic.
  await refinerOrders.ensureForOrder(id, executor);

  return id;
}
