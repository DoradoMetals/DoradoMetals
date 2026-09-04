import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Refiner } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export async function list(executor?: Executor): Promise<Refiner[]> {
  const { rows } = await query<Refiner>(sql("get_all"), [], executor);
  return rows;
}

export async function getOne(id: string, executor?: Executor): Promise<Refiner | undefined> {
  const { rows } = await query<Refiner>(sql("get_one"), [id], executor);
  return rows[0];
}
