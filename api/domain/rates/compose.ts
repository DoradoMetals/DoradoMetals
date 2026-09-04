// The shape the frontend expects, composed from table rows.
//
// metal_id resolves to a name via one cached metals.metals lookup rather than a join per query - the trade the per-table design makes everywhere.
// Both public and admin shapes (admin adds the audit columns) are built here, so the difference is visible in one file.
import * as metals from "#db/metals/repo.ts";
import * as rules from "#domain/rates/rules.ts";
import type { Rate } from "@dorado/contracts";

// Derived from Rate, not restated by hand: a hand-written version got max_qty (nullable) and created_at (a string on the wire) wrong. `metal` is the only field that is not a column.
export type RateWire = Pick<
  Rate, "id" | "unit" | "min_qty" | "max_qty" | "scrap_pct" | "bullion_pct"
> & { metal: string };

export type AdminRateWire = RateWire &
  Pick<Rate, "metal_id" | "created_at" | "updated_at" | "created_by" | "updated_by">;

const publicShape = (r: Rate, name: string): RateWire => ({
  id: r.id, metal: name, unit: r.unit, min_qty: r.min_qty,
  max_qty: r.max_qty, scrap_pct: r.scrap_pct, bullion_pct: r.bullion_pct,
});

const adminShape = (r: Rate, name: string): AdminRateWire => ({
  id: r.id, metal: name, unit: r.unit, min_qty: r.min_qty,
  max_qty: r.max_qty, scrap_pct: r.scrap_pct, bullion_pct: r.bullion_pct,
  metal_id: r.metal_id, created_at: r.created_at, updated_at: r.updated_at,
  created_by: r.created_by, updated_by: r.updated_by,
});

// Ordered by metal name, which is why sorting happens here and not in the SQL: without the join, the name isn't a column to sort on.
const byMetalThenQty = (a: RateWire, b: RateWire) =>
  a.metal.localeCompare(b.metal) || a.min_qty - b.min_qty || a.id.localeCompare(b.id);

// A rate whose metal does not resolve is dropped, deliberately: the pricing path types `metal` as a string, and letting an undefined through would put it in a rate band.
const resolved = (rows: Rate[], names: Map<string, string>) =>
  rows.flatMap((r) => {
    const name = names.get(r.metal_id);
    return name === undefined ? [] : [{ row: r, name }];
  });

export async function toPublicList(rows: Rate[]): Promise<RateWire[]> {
  const names = await metals.namesById();
  return resolved(rows, names).map(({ row, name }) => publicShape(row, name)).sort(byMetalThenQty);
}

export async function toAdminList(rows: Rate[]): Promise<AdminRateWire[]> {
  const names = await metals.namesById();
  return resolved(rows, names).map(({ row, name }) => adminShape(row, name)).sort(byMetalThenQty);
}

export async function toAdminOne(row: Rate): Promise<AdminRateWire> {
  const names = await metals.namesById();
  const name = names.get(row.metal_id);
  rules.assertMetalName(name, row.id);
  return adminShape(row, name);
}
