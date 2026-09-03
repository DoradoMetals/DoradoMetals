// products.mints, and nothing else.
//
// READ ONLY. Mints are reference data - the admin product form picks one - and
// nothing in the application creates or edits them. A create/update/delete here
// would be API surface for something that only changes by migration.
//
// getAll KEEPS ITS NAME rather than becoming list() (D212's CRUD ruling spells
// it list()): domain/products/compose.ts calls it directly, and products is
// another lane's feature in this pass - renaming here would mean editing a
// file outside this batch's scope. No wrapper or spread lives in this repo
// either way, which is the part the ruling actually polices.
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
