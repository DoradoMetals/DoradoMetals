// places.addresses, and nothing else - a postal address has no owner (places.user_addresses owns that link).
// NO PLAIN list(): every caller has one id (getOne), a batch (getMany), or is snapshotting one row.
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import { AddressWriteColumns } from "@dorado/contracts";
import type { Address, AddressPatch } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type AddressRow = Address;

// Ruling 64: the allowed list IS the contract's, so a column added to the table
// becomes writable by naming it there and nowhere else.
export const PATCHABLE = Object.keys(AddressWriteColumns.shape) as readonly string[];

export async function getOne(id: string, executor?: Executor): Promise<AddressRow | undefined> {
  const { rows } = await query<AddressRow>(sql("get_one"), [id], executor);
  return rows[0];
}

export async function getMany(ids: string[], executor?: Executor): Promise<AddressRow[]> {
  if (ids.length === 0) return [];
  const { rows } = await query<AddressRow>(sql("get_many"), [ids], executor);
  return rows;
}

// is_valid TRUE and is_residential FALSE are literals, not caller-supplied; the carrier's validation sets the real values afterwards through update().
export async function create(
  id: string, patch: AddressPatch, executor?: Executor
): Promise<AddressRow> {
  const { rows } = await query<AddressRow>(
    sql("create"),
    [
      id, patch.line_1, patch.line_2, patch.city, patch.state, patch.country,
      patch.zip, patch.country_code, patch.phone_number, true, false,
    ],
    executor
  );
  return rows[0];
}

// One dynamic UPDATE serving two callers with different columns: a key ABSENT from the patch is untouched, a key PRESENT as null clears it - COALESCE can't tell those apart.
export async function update(
  id: string, patch: AddressWriteColumns, executor?: Executor
): Promise<AddressRow | undefined> {
  const built = buildUpdate({
    table: "places.addresses",
    allowed: PATCHABLE,
    patch,
    where: { id },
    returning:
      "id, line_1, line_2, city, state, country, zip, country_code, " +
      "phone_number, created_at, updated_at, is_valid, is_residential",
  });
  if (!built) return await getOne(id, executor);
  const { rows } = await query<AddressRow>(built.text, built.values, executor);
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

// The same question asked of a whole book at once, so a list of entries costs
// one statement instead of one per address.
export async function activeAmong(
  ids: string[], user_id: string, executor?: Executor
): Promise<string[]> {
  if (ids.length === 0) return [];
  const { rows } = await query<{ source_address_id: string }>(
    sql("active_among"), [ids, user_id], executor
  );
  return rows.map((r) => r.source_address_id);
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const r = await query(sql("delete"), [id], executor);
  return r.rowCount === 1;
}

// A frozen copy of the address as it is now, so later edits can't rewrite where a parcel went. Returns null when the source doesn't exist; the caller decides whether that refuses.
export async function snapshot(
  address_id: string, executor?: Executor
): Promise<string | null> {
  const { rows } = await query<{ id: string }>(sql("snapshot"), [address_id], executor);
  return rows[0]?.id ?? null;
}
