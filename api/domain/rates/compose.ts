// The shape the frontend expects, composed from table rows.
//
// THIS IS THE FIRST SHIM THAT ACTUALLY COMPOSES. rates.rates has metal_id; the
// frontend reads `metal`, the name. The implementation this replaces got that
// with a JOIN on every read, which put a column into a row type claiming to be
// rates.rates.
//
// Here the repo returns its own table and the name is attached from ONE lookup
// of metals.metals - four rows - rather than a join per query. That is the
// trade the per-table design makes everywhere: a second read instead of a join,
// batched so it is one round trip regardless of how many rates come back.
//
// getAllRates historically omitted the audit columns and getAdminRates included
// them. Both shapes are built here so the difference is visible in one file
// rather than being two nearly-identical SELECT lists.
import * as metals from "#db/metals/repo.ts";
import type { RateRow } from "#db/rates/repo.ts";

// DERIVED FROM RateRow, not restated. Writing the field types out by hand got
// max_qty (nullable) and created_at (a string on the wire, not a Date) wrong
// in the same breath - which is the drift a generated row type exists to
// prevent. `metal` is the only field that is not a column.
export type RateWire = Pick<
  RateRow, "id" | "unit" | "min_qty" | "max_qty" | "scrap_pct" | "bullion_pct"
> & { metal: string };

export type AdminRateWire = RateWire &
  Pick<RateRow, "metal_id" | "created_at" | "updated_at" | "created_by" | "updated_by">;

const publicShape = (r: RateRow, name: string): RateWire => ({
  id: r.id, metal: name, unit: r.unit, min_qty: r.min_qty,
  max_qty: r.max_qty, scrap_pct: r.scrap_pct, bullion_pct: r.bullion_pct,
});

const adminShape = (r: RateRow, name: string): AdminRateWire => ({
  id: r.id, metal: name, unit: r.unit, min_qty: r.min_qty,
  max_qty: r.max_qty, scrap_pct: r.scrap_pct, bullion_pct: r.bullion_pct,
  metal_id: r.metal_id, created_at: r.created_at, updated_at: r.updated_at,
  created_by: r.created_by, updated_by: r.updated_by,
});

// ORDERED BY METAL NAME, which is why sorting happens here and not in the SQL.
// The old query said `ORDER BY m.name, r.min_qty, r.id` - it could, because it
// had joined. Without the join the name is not a column to sort on, so the
// order is applied where the name exists. Same sequence, decided in one place.
const byMetalThenQty = (a: RateWire, b: RateWire) =>
  a.metal.localeCompare(b.metal) || a.min_qty - b.min_qty || a.id.localeCompare(b.id);

// A RATE WHOSE METAL DOES NOT RESOLVE IS DROPPED, which is not a new decision -
// the query this replaces used an INNER join to metals.metals, so such a rate
// never reached a caller then either. Preserved deliberately rather than
// inherited by accident: the pricing path types `metal` as a string, and
// letting an undefined through would put it in a rate band.
const resolved = (rows: RateRow[], names: Map<string, string>) =>
  rows.flatMap((r) => {
    const name = names.get(r.metal_id);
    return name === undefined ? [] : [{ row: r, name }];
  });

export async function toPublicList(rows: RateRow[]): Promise<RateWire[]> {
  const names = await metals.namesById();
  return resolved(rows, names).map(({ row, name }) => publicShape(row, name)).sort(byMetalThenQty);
}

export async function toAdminList(rows: RateRow[]): Promise<AdminRateWire[]> {
  const names = await metals.namesById();
  return resolved(rows, names).map(({ row, name }) => adminShape(row, name)).sort(byMetalThenQty);
}

export async function toAdminOne(row: RateRow): Promise<AdminRateWire> {
  const names = await metals.namesById();
  const name = names.get(row.metal_id);
  if (name === undefined) throw new Error(`rate ${row.id} names a metal that does not exist`);
  return adminShape(row, name);
}
