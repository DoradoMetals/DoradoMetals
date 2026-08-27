// Creating a purchase order: the new schema and exchange, in one transaction.
//
// THIS IS THE ONLY WRITE THIS FEATURE STILL OWNS. Every other write a purchase
// order needs - its status, its offer, its lines, its quoted spots, its money,
// the refiner's numbers, the shipping charge - belongs to the table it touches
// and is shared with sales orders. See create.repo.ts for the reasoning.
//
// EVERY FUNCTION TAKES THE CALLER'S EXECUTOR AND THREADS IT. An order is
// created inside a transaction that also writes its lines and its scrap; a
// write that opened its own connection would commit while the rest rolled back.
import { randomUUID } from "node:crypto";
import * as orders from "#features/purchase-orders/create.repo.ts";
import * as legacy from "#features/purchase-orders/legacy.repo.ts";
import type { Executor } from "#features/purchase-orders/create.repo.ts";

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

  await orders.createOrder(id, userId, status, by, executor);
  await legacy.createOrder(id, userId, addressId, status, executor);

  return id;
}

// THE DEFAULTS A NEW LINE CARRIES, and they live here rather than in the repo.
//
// exchange's insertItems did `data.quantity ?? 1` and `data.bid_premium ?? 0.75`
// inline, and createOrderItem hard-coded quantity 1 and confirmed false. Those
// are business decisions - what we assume when the caller does not say - and
// the repo's job is to write the values it is given, not to invent them.
//
// THERE IS NO PREMIUM DEFAULT, and there must not be one.
//
// This used to carry `bid_premium: 0.75`. That number was never a business
// figure: 033 added orders.items.bid_premium mirroring exchange.scrap's column,
// 065 kept it noting it was "0.75 on 17 of 20 populated rows - the hardcoded
// default in features/scrap/repo.js", and it was then read back out of the
// column and installed here as if it were a decision. The column is dropped in
// 085 and the premium is resolved from rates.rates at creation - see the second
// pass in features/orders/intake.ts.
//
// What is left is genuinely a default: a line is one item unless somebody says
// otherwise, and a new line is unconfirmed until an admin confirms it.
export const ITEM_DEFAULTS = {
  quantity: 1,
  confirmed: false,
} as const;
