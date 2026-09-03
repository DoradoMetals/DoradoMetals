// leads.leads, and nothing else.
//
// A repo owns exactly one table. It does not join, it does not know what a
// caller intends, and it does not shape anything for a client - it reads and
// writes its own rows. Composition across tables is the service's job, and the
// shape a browser wants is the service's job too.
//
// That rule is what makes the row type trustworthy: LeadRow comes from the
// generated contract, so it is whatever the database actually says rather than
// a hand-written guess that drifts. A joined projection could not do that.
//
// Every function takes an optional executor so the service can pull it into a
// transaction. Without one it runs on the pool. Getting that wrong is what
// broke checkout in August, so lint:db checks it mechanically.
//
// ONE UPDATE (D212's CRUD ruling): update takes an id and a patch of the
// columns a caller may change, and answers whether a row actually changed -
// not the row itself, so a caller who wants the fresh state asks getOne for
// it. No setX/markY-style wrapper lives here.
//
// NOBODY PASSES AN AUTHOR ANY MORE. created_by, updated_by, created_at and
// updated_at are written by the public.audit_stamp trigger from the actor on
// the connection (migration 116, shared/http/actor.ts). The `actor` argument
// these functions used to take is gone, and so is the SQL that wrote those
// columns - the signatures are create(row, tx?) and update(id, patch, tx?).
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { leads } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type LeadRow = leads.LeadsRow;

// What a caller may supply on create. An explicit id wins; omitting one lets
// create.sql generate one (COALESCE against gen_random_uuid()). `priority` is
// widened to accept null even though the column itself is NOT NULL - null
// means "unspecified", and create.sql's own COALESCE resolves it to 'Medium'
// before the column ever sees it.
export type NewLead = Pick<LeadRow, "name" | "phone" | "email"> &
  Partial<Pick<LeadRow, "notes">> &
  { priority?: string | null; id?: string | null };

// Every column a caller may change. The statement is BUILT from the keys the
// patch actually carries (shared/db/patch.ts), so an absent key is not written
// and a key present with null CLEARS the column - which the COALESCE statement
// this replaces could not express, because both arrive as null.
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
  // An empty patch changed nothing and nothing failed - true, not a statement
  // with no SET list.
  const built = buildUpdate({ table: "leads.leads", allowed: PATCHABLE, patch, where: { id } });
  if (!built) return true;
  const { rowCount } = await query(built.text, built.values, executor);
  return rowCount === 1;
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql("delete"), [id], executor);
  return rowCount === 1;
}
