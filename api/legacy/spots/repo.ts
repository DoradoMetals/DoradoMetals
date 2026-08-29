// exchange.metals' quote columns. THIS FILE IS SCHEDULED FOR DELETION.
//
// Keyed on the metal's NAME, because exchange.metals carries the quote on the
// metal's own row and identifies it by `type`.
import query from "#shared/db/query.js";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Quote, Executor } from "#features/spots/repo.ts";

const sql = sqlFrom(import.meta.dirname);

export async function upsert(metal_name: string, q: Quote, executor?: Executor): Promise<void> {
  await query(
    sql("upsert"),
    [metal_name, q.ask ?? null, q.bid ?? null, q.dollarChange ?? null, q.percentChange ?? null],
    executor
  );
}
