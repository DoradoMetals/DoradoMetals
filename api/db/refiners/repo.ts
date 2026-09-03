// refiners.refiners, and nothing else — READ ONLY, deliberately: no create/update/remove. A refiner is (id, logo, organization_id); name/email/phone belong to the organization and are composed in compose.ts.
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { refiners } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type RefinerRow = refiners.refiners.Row;

export async function list(executor?: Executor): Promise<RefinerRow[]> {
  const { rows } = await query<RefinerRow>(sql("get_all"), [], executor);
  return rows;
}

export async function getOne(id: string, executor?: Executor): Promise<RefinerRow | undefined> {
  const { rows } = await query<RefinerRow>(sql("get_one"), [id], executor);
  return rows[0];
}
