// places.addresses, and nothing else.
//
// A postal address with no owner - somewhere on earth. Whose address book it is
// in is places.user_addresses, and that is what lets an order snapshot an
// address without copying whose it was, and lets two people share a building.
//
// NO PLAIN list(). Every caller either has one id (getOne), a batch of ids from
// a user's links (getMany), or is snapshotting one row (snapshot) - there is no
// "every address" screen, and a postal address has no natural parent to key
// listFor() on (ownership lives in places.user_addresses, whose own repo
// exposes listFor(userId)).
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { places } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type AddressRow = places.AddressesRow;

// Optional on every field (not just nullable): this is the shape the service
// receives from the caller and passes straight through, and a field the
// caller did not send is simply absent rather than defaulted to null by hand -
// the driver binds undefined the same way. An extra `id` on the object (the
// service's AddressInput carries one for update) is harmless; only these
// fields are ever read.
export type NewAddress = {
  line_1?: string | null;
  line_2?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  zip?: string | null;
  country_code?: string | null;
  phone_number?: string | null;
};

// THE ONE UPDATE, SERVING TWO CALLERS WITH GENUINELY DIFFERENT COLUMNS.
//
// A postal edit patches the eight address fields plus is_residential (always
// reset to false - see service.ts); address validation patches only is_valid
// and is_residential. Both used to be separate repo functions and separate
// statements (update / updateValidation); one dynamic statement now covers
// both, because "which columns does this write" is a property of the CALLER's
// patch object, not of the repo. A key ABSENT from the patch is not touched at
// all (validation never touches the postal fields); a key PRESENT with value
// null clears that column (an edit can blank line_2). That is why this is
// built as "which columns are in the patch", never COALESCE - COALESCE cannot
// tell "omitted" from "explicitly null", and clearing line_2 needs that
// distinction to keep working.
const PATCHABLE = [
  "line_1", "line_2", "city", "state", "country", "zip",
  "country_code", "phone_number", "is_valid", "is_residential",
] as const;
type AddressPatchable = (typeof PATCHABLE)[number];
export type AddressPatch = Partial<Record<AddressPatchable, string | boolean | null>>;

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
// values afterwards through update().
export async function create(
  id: string, row: NewAddress, executor?: Executor
): Promise<AddressRow> {
  const { rows } = await query<AddressRow>(
    sql("create"),
    [
      id, row.line_1, row.line_2, row.city, row.state, row.country,
      row.zip, row.country_code, row.phone_number, true, false,
    ],
    executor
  );
  return rows[0];
}

export async function update(
  id: string, patch: AddressPatch, executor?: Executor
): Promise<boolean> {
  const cols = PATCHABLE.filter((c) => c in patch);
  if (!cols.length) return true;
  const sets = cols.map((c, i) => `${c} = $${i + 2}`);
  const values: unknown[] = [id, ...cols.map((c) => patch[c] ?? null)];
  const { rowCount } = await query(
    `UPDATE places.addresses SET ${sets.join(", ")}, updated_at = now()
      WHERE id = $1`,
    values,
    executor
  );
  return rowCount === 1;
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

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const r = await query(sql("delete"), [id], executor);
  return r.rowCount === 1;
}

// A frozen copy of the address as it is NOW - the row an order records so
// later edits to the book cannot rewrite where a parcel went. Returns null
// when the source does not exist; the caller decides whether that refuses.
export async function snapshot(
  address_id: string, executor?: Executor
): Promise<string | null> {
  const { rows } = await query<{ id: string }>(sql("snapshot"), [address_id], executor);
  return rows[0]?.id ?? null;
}
