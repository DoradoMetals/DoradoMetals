// places.user_addresses, and nothing else - a person's link to an address (label, default). Ownership lives here: places.addresses has no user_id, so getOne is the ownership check.
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { UserAddress } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type UserAddressRow = UserAddress;

// Both default flags follow the one legacy is_default; splitting them apart needs a product decision and a UI, not a repo.
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

// The ownership check: undefined means this address isn't in that person's book, not that it doesn't exist.
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

// The ownership guard is an extra WHERE (user_id beside address_id), not a filter applied after reading - an address in someone else's book matches no row.
// One patch field sets two columns (shipping and billing both follow the one legacy default) - telling them apart is a product change, not a migration one.
export const PATCHABLE = ["label", "default_shipping", "default_billing"] as const;

export async function update(
  address_id: string, user_id: string, row: UserAddressPatch, executor?: Executor
): Promise<UserAddressRow | undefined> {
  const built = buildUpdate({
    table: "places.user_addresses",
    allowed: PATCHABLE,
    patch: {
      label: row.label ?? null,
      default_shipping: row.default_shipping,
      default_billing: row.default_shipping,
    },
    where: { address_id, user_id },
    returning:
      "id, address_id, user_id, label, default_shipping, default_billing",
  });
  if (!built) return undefined;
  const { rows } = await query<UserAddressRow>(built.text, built.values, executor);
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
