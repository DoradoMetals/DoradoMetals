// orders.orders, and the rows a new order is created with.
//
// ONE REPO FOR BOTH DIRECTIONS since wave 5A dissolved features/purchase-orders
// and features/sales-orders. Direction is a COLUMN: the reads, the status write
// and the three workflow flags are direction-blind and were already here, and
// what arrived with the dissolution is the CREATION path, which is not - a
// purchase order is one row plus its engagement, a sales order is five rows
// written together from one payload in one transaction.
//
// Everything else an order needs written - its lines, its quoted spots, its
// money, its address link, the refiner's numbers, the shipping charge - belongs
// to the table it touches and lives in that table's own repo: orders/items,
// orders/spots, orders/transactions, orders/addresses, refiners/spots,
// refiners/items, shipping/shipments. Those are shared by both directions.
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { orders } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

// THE THREE WORKFLOW FLAGS, AS A CLOSED SET. sql/set_flag.sql interpolates a
// column name, which is safe only because it can be one of exactly these three
// - nothing derived from a request can reach the substitution.
export const FLAGS = {
  order_sent: "order_sent",
  tracking_updated: "tracking_updated",
  review_created: "review_created",
} as const;

export type Flag = keyof typeof FLAGS;

// Whether an order is in the new schema at all. orders.orders is populated by
// backfill and kept current by the orders dual-write, so an order that exists
// only in exchange has no row here.
export async function exists(id: string, executor?: Executor): Promise<boolean> {
  const { rows } = await query<{ present: boolean }>(sql("exists"), [id], executor);
  return rows[0]?.present === true;
}

// The direction of ONE order - which of the two an id names, asked of the
// table that now answers it (see sql/direction_of.sql for what this replaced).
export async function directionOf(
  id: string, executor?: Executor
): Promise<string | null> {
  const { rows } = await query<{ direction: string }>(
    sql("direction_of"), [id], executor
  );
  return rows[0]?.direction ?? null;
}

// The direction of several orders at once. Hop THREE of putting an order id
// back onto a shipment - see sql/directions.sql.
export async function directionsById(
  ids: string[], executor?: Executor
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { rows } = await query<{ id: string; direction: string }>(
    sql("directions"), [ids], executor
  );
  return new Map(rows.map((r) => [r.id, r.direction]));
}

// THE ORDER ROWS THEMSELVES, VERBATIM (wave 3). One statement for both
// directions, because orders.orders is one table with a `direction` column -
// the per-direction read services compose an order for the API's OWN
// lifecycle work (pricing, emails, PDFs) and are no longer a wire shape.
//
// Both narrowings are optional and passed as null to mean "every one": a
// direction, and an owner. An admin asking for everything passes neither.
export type OrderRow = orders.OrdersRow;

export async function list(
  { direction = null, user_id = null }: { direction?: string | null; user_id?: string | null },
  executor?: Executor
): Promise<OrderRow[]> {
  const { rows } = await query<OrderRow>(sql("list"), [direction, user_id], executor);
  return rows;
}

export async function getOne(
  id: string, executor?: Executor
): Promise<OrderRow | undefined> {
  const { rows } = await query<OrderRow>(sql("get_one"), [id], executor);
  return rows[0];
}

export async function ownerOf(id: string, executor?: Executor): Promise<string | null> {
  const { rows } = await query<{ user_id: string | null }>(sql("owner_of"), [id], executor);
  return rows[0]?.user_id ?? null;
}

// Who several orders belong to - ownerOf, batched. See sql/owners.sql; a pickup
// reconstructs its user through its shipment's order, and D101 found that asked
// one order at a time.
export async function ownersById(
  ids: string[], executor?: Executor
): Promise<Map<string, string | null>> {
  if (ids.length === 0) return new Map();
  const { rows } = await query<{ id: string; user_id: string | null }>(
    sql("owners"), [ids], executor
  );
  return new Map(rows.map((r) => [r.id, r.user_id]));
}

// THE WRITES, for both directions.
//
// orders.orders is one table where exchange had two, so it gets one statement
// each rather than one per direction. sales-orders currently carries its own
// identical copies - see D42; they converge here rather than here becoming a
// third writer.
export async function setStatus(
  id: string, status: string | null, by: string | null, executor?: Executor
): Promise<string | undefined> {
  const { rows } = await query<{ id: string }>(sql("set_status"), [status, by, id], executor);
  return rows[0]?.id;
}

// The payment-settled advance - set_status with a guard. Only a 'Pending'
// sale moves, so webhook retries and reconciler sweeps are no-ops rather than
// label-stompers. See sql/mark_sale_paid.sql.
export async function markSalePaid(
  id: string, by: string | null, executor?: Executor
): Promise<string | undefined> {
  const { rows } = await query<{ id: string }>(sql("mark_sale_paid"), [id, by], executor);
  return rows[0]?.id;
}

// The abandonment cancel - mark_sale_paid's mirror image, same Pending guard.
export async function markSaleAbandoned(
  id: string, by: string | null, executor?: Executor
): Promise<string | undefined> {
  const { rows } = await query<{ id: string }>(sql("mark_sale_abandoned"), [id, by], executor);
  return rows[0]?.id;
}

// The two reconciliation sweeps' candidate reads. See each statement's header.
export type SettledAwaiting = { order_id: string; payment_intent_id: string };
export async function findSalesAwaitingSettledIntent(
  executor?: Executor
): Promise<SettledAwaiting[]> {
  const { rows } = await query<SettledAwaiting>(
    sql("find_sales_awaiting_settled_intent"), [], executor);
  return rows;
}

export type AbandonedSale = {
  order_id: string; user_id: string | null;
  used_funds: boolean | null; reserved_funds: number | null;
  payment_intent_id: string | null; payment_status: string | null;
};
export async function findAbandonedSales(
  ttl_hours: number, executor?: Executor
): Promise<AbandonedSale[]> {
  const { rows } = await query<AbandonedSale>(
    sql("find_abandoned_sales"), [ttl_hours], executor);
  return rows;
}

export type ReservedFunds = {
  user_id: string | null; used_funds: boolean | null; reserved_funds: number | null;
};
export async function findReservedFunds(
  order_id: string, executor?: Executor
): Promise<ReservedFunds | undefined> {
  const { rows } = await query<ReservedFunds>(sql("find_reserved_funds"), [order_id], executor);
  return rows[0];
}

// exchange's createReview was this with `review_created` hard-coded.
export async function setFlag(
  id: string, flag: Flag, executor?: Executor
): Promise<string | undefined> {
  const { rows } = await query<{ id: string }>(
    sql("set_flag").replaceAll("__COLUMN__", FLAGS[flag]), [id], executor
  );
  return rows[0]?.id;
}

// Whether the order's quoted spots are pinned. NOT setFlag: that writes `true`
// and only `true`, because its three columns are one-way latches. This one
// toggles - the pricing path locks, the cancel path unlocks - so it takes the
// value. See sql/set_spots_locked.sql.
//
// exchange's half was toggleSpots(locked, order_id), and the argument order is
// deliberately the other way round here: every other write in this repo takes
// the id first.
export async function setSpotsLocked(
  id: string, locked: boolean, executor?: Executor
): Promise<{ id: string; spots_locked: boolean } | undefined> {
  const { rows } = await query<{ id: string; spots_locked: boolean }>(
    sql("set_spots_locked"), [locked, id], executor
  );
  return rows[0];
}

// --------------------------------------------------------------- THE CREATES
//
// `number` comes from EXCHANGE's sequence in both statements - see
// sql/create_purchase.sql. The two schemas share one numbering space while
// both are live, and the new schema has no sequence of its own.

export async function createPurchaseOrder(
  id: string, user_id: string | null, status: string | null,
  by: string | null, executor?: Executor
): Promise<{ id: string; number: number }> {
  const { rows } = await query<{ id: string; number: number }>(
    sql("create_purchase"), [id, user_id, status, by], executor
  );
  return rows[0];
}

export async function createSalesOrder(
  id: string, user_id: string | null, status: string | null,
  by: string | null, executor?: Executor
): Promise<{ id: string; number: number }> {
  const { rows } = await query<{ id: string; number: number }>(
    sql("create_sales"), [id, user_id, status, by], executor
  );
  return rows[0];
}

// THE FOUR ROWS THAT ARE WRITTEN WITH A SALES ORDER AND ONLY WITH IT.
//
// Not split into four write-only repos: a sales order's money, its lines, its
// address link and its quoted spots are only ever written TOGETHER, in one
// transaction, from one payload, so four files no caller can use
// independently would be four files and one service calling all four in a
// fixed order anyway. The READS of those tables are already split properly -
// orders/transactions, orders/items, orders/addresses, orders/spots each own
// their table and are shared with purchase orders.

// The twelve money values, in sql/create_totals.sql's order. The five renames
// from exchange's names are stated in that file.
type TotalsValues = [
  number | null, number | null, string | null, number | null,
  number | null, number | null, boolean | null,
  number | null, number | null, number | null, number | null,
];

export async function createTotals(
  id: string, order_id: string, values: TotalsValues, by: string | null, executor?: Executor
): Promise<void> {
  await query(sql("create_totals"), [id, order_id, ...values, by], executor);
}

export async function createItem(
  id: string, order_id: string, bullion_id: string | null, metal_id: string,
  price: number | null, quantity: number | null, premium: number | null,
  sales_tax_charged: number | null, executor?: Executor
): Promise<void> {
  await query(
    sql("create_item"),
    [id, order_id, bullion_id, metal_id, price, quantity, premium, sales_tax_charged ?? 0],
    executor
  );
}

export async function createAddress(
  id: string, order_id: string, address_id: string, source_address_id: string | null,
  executor?: Executor
): Promise<void> {
  await query(sql("create_address"), [id, order_id, address_id, source_address_id], executor);
}

export async function createSpot(
  id: string, order_id: string, metal_id: string,
  ask: number | null, bid: number | null, executor?: Executor
): Promise<void> {
  await query(sql("create_spot"), [id, order_id, metal_id, ask, bid], executor);
}

// Writes the ENGAGEMENT (refiners.orders, 093) - orders.orders.refinery_id
// dropped in 094. See sql/set_refinery.sql for why it is an upsert.
export async function setRefinery(
  id: string, refinery_id: string | null, executor?: Executor
): Promise<{ id: string; supplier_id: string | null } | undefined> {
  const { rows } = await query<{ id: string; supplier_id: string | null }>(
    sql("set_refinery"), [refinery_id, id], executor
  );
  return rows[0];
}
