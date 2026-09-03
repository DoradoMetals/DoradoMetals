// leads.leads, and nothing else.
//
// update returns whether a row changed, not the row itself; call getOne for fresh state. No setX/markY wrappers.
// created_by, updated_by, created_at and updated_at are written by the public.audit_stamp trigger from the connection actor (migration 116) - not passed as arguments here.
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { leads } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type LeadRow = leads.LeadsRow;

// priority accepts null even though the column is NOT NULL: null means "unspecified", resolved to 'Medium' by create.sql's own COALESCE.
export type NewLead = Pick<LeadRow, "name" | "phone" | "email"> &
  Partial<Pick<LeadRow, "notes">> &
  { priority?: string | null; id?: string | null };

// The statement is built from the keys the patch actually carries: an absent key is not written, a key present with null CLEARS the column.
export const PATCHABLE = [
  "name", "phone", "email", "last_contacted", "converted", "contacted",
  "responded", "contact", "notes", "priority",
] as const;

export type LeadPatch = Partial<Pick<LeadRow, (typeof PATCHABLE)[number]>>;

export async function getOne(id: string, executor?: Executor): Promise<LeadRow | undefined> {
  const { rows } = await query<LeadRow>(sql("get_one"), [id], executor);
  return rows[0];
}

export async function list(executor?: Executor): Promise<LeadRow[]> {
  const { rows } = await query<LeadRow>(sql("get_all"), [], executor);
  return rows;
}

export async function create(row: NewLead, executor?: Executor): Promise<LeadRow> {
  const { rows } = await query<LeadRow>(
    sql("create"),
    [row.id, row.name, row.phone, row.email, row.priority, row.notes],
    executor
  );
  return rows[0];
}

export async function update(
  id: string, patch: LeadPatch, executor?: Executor
): Promise<boolean> {
  // An empty patch changed nothing and nothing failed - true, not a statement with no SET list.
  const built = buildUpdate({ table: "leads.leads", allowed: PATCHABLE, patch, where: { id } });
  if (!built) return true;
  const { rowCount } = await query(built.text, built.values, executor);
  return rowCount === 1;
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql("delete"), [id], executor);
  return rowCount === 1;
}
