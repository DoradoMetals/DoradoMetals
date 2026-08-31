// orders.addresses, and nothing else.
//
// TWO IDS, AND THE DIFFERENCE IS THE POINT.
//
//   address_id        the SNAPSHOT - a places.addresses row recording where the
//                     parcel actually went, frozen so that editing an address
//                     book entry later cannot rewrite history.
//   source_address_id the address BOOK row it was taken from.
//
// The wire returns the SOURCE id, because the frontend posts it back at
// checkout and the API resolves it against the book. Returning the snapshot's
// id would break checkout - which is the note the order projection carries at
// the top of its own file.
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { orders } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type OrderAddressRow = orders.AddressesRow;

export async function getFor(
  order_id: string, executor?: Executor
): Promise<OrderAddressRow | undefined> {
  const { rows } = await query<OrderAddressRow>(sql("get_for"), [order_id], executor);
  return rows[0];
}

export async function getMany(
  order_ids: string[], executor?: Executor
): Promise<OrderAddressRow[]> {
  if (order_ids.length === 0) return [];
  const { rows } = await query<OrderAddressRow>(sql("get_many"), [order_ids], executor);
  return rows;
}
