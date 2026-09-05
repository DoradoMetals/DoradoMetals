import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import { columnsOf, returningOf, ACTOR_IDS } from "#shared/db/columns.ts";
import { Lead, LeadPatch } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export const PATCHABLE = columnsOf(LeadPatch);

const RETURNING = returningOf(Lead.omit(ACTOR_IDS));

export async function getOne(id: string, executor?: Executor): Promise<Lead | undefined> {
  const { rows } = await query<Lead>(sql("get_one"), [id], executor);
  return rows[0];
}

export async function list(executor?: Executor): Promise<Lead[]> {
  const { rows } = await query<Lead>(sql("get_all"), [], executor);
  return rows;
}

export async function create(row: LeadPatch, executor?: Executor): Promise<Lead> {
  const { rows } = await query<Lead>(
    sql("create"),
    [row.name, row.phone, row.email, row.priority, row.notes],
    executor
  );
  return rows[0];
}

export async function update(
  id: string, patch: LeadPatch, executor?: Executor
): Promise<Lead | undefined> {
  const built = buildUpdate({
    table: "leads.leads", allowed: PATCHABLE, patch, where: { id }, returning: RETURNING,
  });
  if (!built) return await getOne(id, executor);
  const { rows } = await query<Lead>(built.text, built.values, executor);
  return rows[0];
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql("delete"), [id], executor);
  return rowCount === 1;
}
