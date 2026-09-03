// products.mints, and nothing else.
//
// READ ONLY: mints are reference data (the admin product form picks one), nothing writes them at runtime.
// getAll keeps its name rather than becoming list(): domain/products/compose.ts calls it directly and products is outside this pass's scope.
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { products } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type MintRow = products.MintsRow;

export async function getAll(executor?: Executor): Promise<MintRow[]> {
  const { rows } = await query<MintRow>(sql("get_all"), [], executor);
  return rows;
}

export async function getOne(id: string, executor?: Executor): Promise<MintRow | undefined> {
  const { rows } = await query<MintRow>(sql("get_one"), [id], executor);
  return rows[0];
}
