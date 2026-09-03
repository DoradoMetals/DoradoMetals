// products.mints, and nothing else.
//
// READ ONLY. Mints are reference data - the admin product form picks one - and
// nothing in the application creates or edits them. A create/update/delete here
// would be API surface for something that only changes by migration.
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
