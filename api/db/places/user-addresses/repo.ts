// places.user_addresses, and nothing else - a person's link to an address (recipient, nickname, default). Ownership lives here: places.addresses has no user_id, so getOne is the ownership check.
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import { UserAddressWriteColumns } from "@dorado/contracts";
import type { UserAddress } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

const RETURNING =
  "id, address_id, user_id, recipient_name, label, default_shipping, default_billing";

// Ruling 64: derived from the contract, never a second spelling of it.
export const PATCHABLE =
  Object.keys(UserAddressWriteColumns.shape) as readonly string[];

export async function listFor(
  user_id: string, executor?: Executor
): Promise<UserAddress[]> {
  const { rows } = await query<UserAddress>(sql("get_for_user"), [user_id], executor);
  return rows;
}

export async function getByAddress(
  address_id: string, executor?: Executor
): Promise<UserAddress[]> {
  const { rows } = await query<UserAddress>(sql("get_by_address"), [address_id], executor);
  return rows;
}

// The ownership check: undefined means this address isn't in that person's book, not that it doesn't exist.
export async function getOne(
  address_id: string, user_id: string, executor?: Executor
): Promise<UserAddress | undefined> {
  const { rows } = await query<UserAddress>(sql("get_one"), [address_id, user_id], executor);
  return rows[0];
}

export async function create(
  id: string, address_id: string, user_id: string,
  patch: UserAddressWriteColumns, executor?: Executor
): Promise<UserAddress> {
  const { rows } = await query<UserAddress>(
    sql("create"),
    [
      id, address_id, user_id, patch.recipient_name ?? null, patch.label ?? null,
      patch.default_shipping ?? false, patch.default_billing ?? false,
    ],
    executor
  );
  return rows[0];
}

// The ownership guard is an extra WHERE (user_id beside address_id), not a filter applied after reading - an address in someone else's book matches no row.
export async function update(
  address_id: string, user_id: string,
  patch: UserAddressWriteColumns, executor?: Executor
): Promise<UserAddress | undefined> {
  const built = buildUpdate({
    table: "places.user_addresses",
    allowed: PATCHABLE,
    patch,
    where: { address_id, user_id },
    returning: RETURNING,
  });
  if (!built) return await getOne(address_id, user_id, executor);
  const { rows } = await query<UserAddress>(built.text, built.values, executor);
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

// A VISITOR'S BOOK CHANGES HANDS on sign-in (ruling 63). Answers how many
// links moved. The ADDRESSES are not re-keyed - they are shared, and this table
// is the join that makes them so.
export async function reassign(
  from_user_id: string, to_user_id: string, executor?: Executor
): Promise<number> {
  const { rowCount } = await query(sql("reassign"), [from_user_id, to_user_id], executor);
  return rowCount ?? 0;
}

export async function remove(
  address_id: string, user_id: string, executor?: Executor
): Promise<boolean> {
  const r = await query(sql("delete"), [address_id, user_id], executor);
  return r.rowCount === 1;
}
