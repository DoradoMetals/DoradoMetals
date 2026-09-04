// leads.leads, and nothing else.
//
// update answers THE WRITTEN ROW (RETURNING), not a boolean: a caller that
// needs fresh state after a patch used to run a second SELECT that could come
// back empty, which is a second "no such lead" refusal for one fact.
// created_by, updated_by, created_at and updated_at are written by the public.audit_stamp trigger from the connection actor (migration 116) - not passed as arguments here.
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import { columnsOf, returningOf, ACTOR_IDS } from "#shared/db/columns.ts";
import { Lead, LeadPatch } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

// THE COLUMNS, FROM THE CONTRACT (ruling 64). `LeadPatch` is the ten columns
// leads.leads allows to change; the statement is built from the keys the patch
// actually carries, so an absent key is not written and a key present with null
// CLEARS the column.
export const PATCHABLE = columnsOf(LeadPatch);

// The wire's projection: every column except the actor ids audit_stamp writes
// beside the display names.
const RETURNING = returningOf(Lead.omit(ACTOR_IDS));

// A create may name its own id; an update never can - there the id is the
// WHERE key.
type LeadCreate = LeadPatch & { id?: string | null };

export async function getOne(id: string, executor?: Executor): Promise<Lead | undefined> {
  const { rows } = await query<Lead>(sql("get_one"), [id], executor);
  return rows[0];
}

export async function list(executor?: Executor): Promise<Lead[]> {
  const { rows } = await query<Lead>(sql("get_all"), [], executor);
  return rows;
}

export async function create(row: LeadCreate, executor?: Executor): Promise<Lead> {
  const { rows } = await query<Lead>(
    sql("create"),
    [row.id, row.name, row.phone, row.email, row.priority, row.notes],
    executor
  );
  return rows[0];
}

export async function update(
  id: string, patch: LeadPatch, executor?: Executor
): Promise<Lead | undefined> {
  // An empty patch changed nothing and nothing failed - the row as it stands, not a statement with no SET list.
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
