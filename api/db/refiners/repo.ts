// refiners.refiners, and nothing else.
//
// READ ONLY (CRUD-batch-3, D212's ruling): no create/update/remove - the one
// route is get_all. A refiner is (id, logo, organization_id); everything a
// caller thinks of as the refiner's identity - name, email, phone - belongs to
// the organization, and is composed in compose.ts.
//
// That split is the whole reason the new schema has two tables where exchange
// had one: exchange.suppliers carries name/email/phone/is_active on the same
// row, and the generator reported every one of them as unmappable rather than
// guessing they had moved.
//
// getAll renamed to `list` to match the repo contract (getOne/list/listFor).
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { refiners } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type RefinerRow = refiners.RefinersRow;

export async function list(executor?: Executor): Promise<RefinerRow[]> {
  const { rows } = await query<RefinerRow>(sql("get_all"), [], executor);
  return rows;
}

export async function getOne(id: string, executor?: Executor): Promise<RefinerRow | undefined> {
  const { rows } = await query<RefinerRow>(sql("get_one"), [id], executor);
  return rows[0];
}
