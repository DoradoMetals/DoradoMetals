// places.addresses, and nothing else.
//
// A postal address with no owner - somewhere on earth. Whose address book it is
// in is places.user_addresses, and that is what lets an order snapshot an
// address without copying whose it was, and lets two people share a building.
import query from "#shared/db/query.js";
import { sqlFrom } from "#shared/db/sql.ts";
import type { places } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type AddressRow = places.AddressesRow;

// The postal parts of an address, in the order both create and update take
// them. ONE array feeds the new-schema statement and, with the owner and label
// spliced in, the exchange one.
export type AddressValues = [
  string | null, string | null, string | null, string | null,
  string | null, string | null, string | null, string | null,
];

export async function getOne(id: string, executor?: Executor): Promise<AddressRow | undefined> {
  const { rows } = await query<AddressRow>(sql("get_one"), [id], executor);
  return rows[0];
}

export async function getMany(ids: string[], executor?: Executor): Promise<AddressRow[]> {
  if (ids.length === 0) return [];
  const { rows } = await query<AddressRow>(sql("get_many"), [ids], executor);
  return rows;
}

// is_valid TRUE and is_residential FALSE are LITERALS, not caller-supplied -
// which is what the create this replaces did. Address validation sets the real
// values afterwards through updateValidation.
export async function create(
  id: string, values: AddressValues, executor?: Executor
): Promise<AddressRow> {
  const { rows } = await query<AddressRow>(
    sql("create"), [id, ...values, true, false], executor
  );
  return rows[0];
}

// is_residential is written FALSE here too, matching the update this replaces.
// It looks like a bug and is preserved deliberately: changing what an edit does
// to a validated address is a behaviour change, not a migration.
export async function update(
  id: string, values: AddressValues, executor?: Executor
): Promise<AddressRow | undefined> {
  const { rows } = await query<AddressRow>(
    sql("update"), [...values, false, id], executor
  );
  return rows[0];
}

export async function updateValidation(
  id: string, is_valid: boolean, is_residential: boolean, executor?: Executor
): Promise<AddressRow | undefined> {
  const { rows } = await query<AddressRow>(
    sql("update_validation"), [is_valid, is_residential, id], executor
  );
  return rows[0];
}

// Whether anything still needs this address - a link, or an order snapshot.
// Asked before deleting it.
export async function isReferenced(id: string, executor?: Executor): Promise<boolean> {
  const { rows } = await query<{ referenced: boolean }>(
    sql("is_referenced"), [id], executor
  );
  return rows[0]?.referenced === true;
}

// Whether an unfinished order depends on this address, which is what stops it
// being edited or deleted underneath one.
export async function isActive(
  address_id: string, user_id: string, executor?: Executor
): Promise<boolean> {
  const { rows } = await query<{ locked: boolean }>(
    sql("is_active"), [address_id, user_id], executor
  );
  return rows[0]?.locked === true;
}

export async function remove(id: string, executor?: Executor): Promise<number> {
  const r = await query(sql("delete"), [id], executor);
  return r.rowCount ?? 0;
}
