// places.user_addresses, and nothing else.
//
// A person's relationship to a postal address: what they call it, and whether
// it is their default. THE OWNERSHIP OF AN ADDRESS LIVES HERE, which is the
// consequence of the split that matters most - places.addresses has no user_id,
// so `WHERE id = $1 AND user_id = $2` is not a statement this schema can write.
// getOne is that check.
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { places } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type UserAddressRow = places.UserAddressesRow;

// exchange has ONE is_default, so both new-schema defaults follow it -
// splitting them apart needs a product decision and a UI, not a repo.
export type NewUserAddress = { label?: string | null; default_shipping: boolean };
export type UserAddressPatch = { label?: string | null; default_shipping: boolean };

export async function listFor(
  user_id: string, executor?: Executor
): Promise<UserAddressRow[]> {
  const { rows } = await query<UserAddressRow>(sql("get_for_user"), [user_id], executor);
  return rows;
}

export async function getByAddress(
  address_id: string, executor?: Executor
): Promise<UserAddressRow[]> {
  const { rows } = await query<UserAddressRow>(sql("get_by_address"), [address_id], executor);
  return rows;
}

// The ownership check. Undefined means this address is not in that person's
// book - not that it does not exist.
export async function getOne(
  address_id: string, user_id: string, executor?: Executor
): Promise<UserAddressRow | undefined> {
  const { rows } = await query<UserAddressRow>(sql("get_one"), [address_id, user_id], executor);
  return rows[0];
}

export async function create(
  id: string, address_id: string, user_id: string, row: NewUserAddress, executor?: Executor
): Promise<UserAddressRow> {
  const { rows } = await query<UserAddressRow>(
    sql("create"),
    [id, address_id, user_id, row.label, row.default_shipping, row.default_shipping],
    executor
  );
  return rows[0];
}

export async function update(
  address_id: string, user_id: string, row: UserAddressPatch, executor?: Executor
): Promise<UserAddressRow | undefined> {
  const { rows } = await query<UserAddressRow>(
    sql("update"),
    [row.label, row.default_shipping, row.default_shipping, address_id, user_id],
    executor
  );
  return rows[0];
}

export async function setDefault(
  user_id: string, address_id: string, executor?: Executor
): Promise<boolean> {
  // Two statements on the caller's executor, clear before mark - the
  // one-statement swap tripped 089's unique index on row-visit order.
  await query(sql("set_default_clear"), [user_id, address_id], executor);
  const r = await query(sql("set_default_mark"), [user_id, address_id], executor);
  return r.rowCount === 1;
}

export async function remove(
  address_id: string, user_id: string, executor?: Executor
): Promise<boolean> {
  const r = await query(sql("delete"), [address_id, user_id], executor);
  return r.rowCount === 1;
}
