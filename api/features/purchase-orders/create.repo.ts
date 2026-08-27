// The purchase direction of orders.orders.
//
// NOT one table, for the same reason sales-orders/repo.ts is not: creating a
// purchase order writes its own row from one payload,
// in one transaction. Everything else this feature does to a table is an
// INDEPENDENT admin operation and lives in that table's own repo -
// features/orders, orders/items, orders/spots,
// orders/transactions, refiners/spots, refiners/items and shipping/shipments
// each own their writes and are shared with sales orders.
//
// So this file is deliberately small. It is the creation path and nothing else.
//
// NAMED create.repo.ts, NOT repo.ts, AND ONLY UNTIL THE PIVOT. `repo.js` in
// this directory is still the *_SOURCE switch, and TypeScript resolves the
// subpath import `#features/purchase-orders/repo.js` to a sibling `repo.ts` if
// one exists - so adding repo.ts here silently shadowed the switch for every
// caller. tsc caught it; the switch guards did not, because the file they walk
// still existed and still had its exports. This becomes repo.ts when repo.js
// is deleted, matching sales-orders.
import query from "#shared/db/query.js";
import { sqlFrom } from "#shared/db/sql.ts";
import type { PoolClient } from "pg";

const sql = sqlFrom(import.meta.dirname);

export type Executor = PoolClient | undefined;

// `number` comes from EXCHANGE's sequence - see sql/create.sql.
export async function createOrder(
  id: string, user_id: string | null, status: string | null,
  by: string | null, executor?: Executor
): Promise<{ id: string; number: number }> {
  const { rows } = await query<{ id: string; number: number }>(
    sql("create"), [id, user_id, status, by], executor
  );
  return rows[0];
}
