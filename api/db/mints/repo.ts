// products.mints, and nothing else.
//
// READ ONLY: mints are reference data (the admin product form picks one), nothing writes them at runtime.
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Mint } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);


export async function list(executor?: Executor): Promise<Mint[]> {
  const { rows } = await query<Mint>(sql("get_all"), [], executor);
  return rows;
}

export async function getOne(id: string, executor?: Executor): Promise<Mint | undefined> {
  const { rows } = await query<Mint>(sql("get_one"), [id], executor);
  return rows[0];
}
