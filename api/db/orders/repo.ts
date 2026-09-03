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
import { buildUpdate } from "#shared/db/patch.ts";
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

// THE ONE WRITE, for both directions (Jacob's CRUD ruling, D209): a repo
// updates a record - it does not grow a function per column. The patch is a
// whitelisted column map; the optional guard is a row-state precondition
// evaluated IN THE STATEMENT, which is what makes the Pending-only
// transitions (payment settled, abandonment cancelled) atomic under webhook
// and reconciler retries - zero rows means "nothing needed doing", never a
// stomped later status.
// `updated_by` USED TO BE IN THIS LIST and is not any more: the caller passed
// the session's name into the patch beside the status, so a status write and
// an audit write were the same statement and either could be forgotten. The
// public.audit_stamp trigger writes updated_by, updated_by_id and updated_at
// on every UPDATE built here (migration 116); shared/db/patch.ts throws if one
// is ever put back in a patch.
export const PATCHABLE = [
  "status", "order_sent", "tracking_updated",
  "review_created", "spots_locked", "notes",
] as const;
type Patchable = (typeof PATCHABLE)[number];
export type OrderPatch = Partial<Record<Patchable, string | boolean | null>>;

const GUARDABLE = ["status", "direction"] as const;
type Guardable = (typeof GUARDABLE)[number];
export type OrderGuard = Partial<Record<Guardable, string>>;

export async function update(
  id: string, patch: OrderPatch, guard: OrderGuard = {}, executor?: Executor
): Promise<{ id: string } | undefined> {
  const where: Record<string, unknown> = { id };
  for (const g of GUARDABLE) if (g in guard) where[g] = guard[g];
  const built = buildUpdate({
    table: "orders.orders",
    allowed: PATCHABLE,
    patch,
    where,
    casts: { direction: "orders.direction" },
    returning: "id",
  });
  if (!built) return { id };
  const { rows } = await query<{ id: string }>(built.text, built.values, executor);
  return rows[0];
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

// --------------------------------------------------------------- THE CREATE
//
// ONE statement for one table (Jacob's CRUD ruling): direction is a column
// and the row decides it. `number` is drawn from EXCHANGE's sequence for the
// direction - the two schemas share one numbering space while both are live,
// and the new schema has no sequence of its own.
// created_by and created_by_id ARE NOT FIELDS OF THIS TYPE any more. An order
// is created by whoever is signed in, and public.audit_stamp reads that off the
// connection (migration 116) - a create path that also carried the author was
// a second place for it to be wrong.
export type NewOrder = {
  id?: string | null;
  user_id: string | null;
  direction: "purchase" | "sale";
  status: string;
  notes?: string | null;
};

export async function create(
  row: NewOrder, executor?: Executor
): Promise<{ id: string; number: number }> {
  const { rows } = await query<{ id: string; number: number }>(
    sql("create"),
    [row.id ?? null, row.user_id, row.direction, row.status, row.notes ?? null],
    executor
  );
  return rows[0];
}

// The sub-table writes that used to sit here - createTotals, createItem,
// createAddress, createSpot - live with their tables now (orders/transactions,
// orders/items, orders/addresses, orders/spots), which is what this file's own
// header has always said. The defence for keeping them here was "only ever
// written together", and create.ts writing three of the four independently is
// what proved it false (Jacob, 2026-09-01: separation of concerns - transport,
// service, repo - and a spots write does not live in the parent repo).

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
