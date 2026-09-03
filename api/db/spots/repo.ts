// spots.spots, and nothing else.
//
// NO getOne/create/update/remove: a spot has no lifecycle of its own. There is
// exactly one row per metal, seeded by migration, and the only write the
// application ever makes is `upsert` - a quote arriving for a metal that
// already has a row. Nothing creates a spot, nothing deletes one, and no
// caller ever asks for a single metal's quote in isolation from the rest
// (list() below is the only read). D212's CRUD ruling collapses a table to
// one repo with those five verbs where the table has that many distinct
// operations; this one genuinely has one.
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { spots } from "@dorado/contracts";

const sql = sqlFrom(import.meta.dirname);

// DERIVED FROM THE TABLE, NOT RESTATED (D103). Five of these six fields were
// hand-written copies of spots.spots columns; a rename or a widened nullability
// would have compiled here and failed at runtime.
//
// TWO DELIBERATE DIFFERENCES, both of which the Omit makes visible:
//   - `id` is not projected. sql/get_all.sql does not select it and nothing
//     downstream keys on it - a spot is identified by its metal.
//   - `updated_at` is a Date and not a string. The contracts describe the WIRE,
//     where a timestamp is JSON and therefore text; this is what node-postgres
//     hands back, before any serialisation.
export type SpotRow = Omit<spots.SpotsRow, "id" | "updated_at"> & {
  updated_at: Date;
};

export type Quote = {
  ask?: number | null; bid?: number | null;
  dollarChange?: number | null; percentChange?: number | null;
};

export async function list(executor?: Executor): Promise<SpotRow[]> {
  const { rows } = await query<SpotRow>(sql("get_all"), [], executor);
  return rows;
}

export async function upsert(metal_id: string, q: Quote, executor?: Executor): Promise<void> {
  await query(
    sql("upsert"),
    [metal_id, q.ask ?? null, q.bid ?? null, q.dollarChange ?? null, q.percentChange ?? null],
    executor
  );
}
