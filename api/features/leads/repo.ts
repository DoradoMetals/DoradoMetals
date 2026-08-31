// leads.leads, and nothing else.
//
// A repo owns exactly one table. It does not join, it does not know what a
// caller intends, and it does not shape anything for a client - it reads and
// writes its own rows. Composition across tables is the service's job, and the
// shape a browser wants is wire.ts's.
//
// That rule is what makes the row type trustworthy: LeadRow comes from the
// generated contract, so it is whatever the database actually says rather than
// a hand-written guess that drifts. A joined projection could not do that.
//
// Every function takes an optional executor so the service can pull it into a
// transaction. Without one it runs on the pool. Getting that wrong is what
// broke checkout in August, so lint:db checks it mechanically.
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { leads } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type LeadRow = leads.LeadsRow;

// What a caller may supply. The database fills the timestamps and the columns
// carrying defaults; the id is supplied by the service so both schemas agree.
export type NewLead = Pick<LeadRow, "name" | "phone" | "email"> &
  Partial<Pick<LeadRow, "created_by" | "updated_by" | "priority" | "notes">>;

export async function getOne(id: string, executor?: Executor): Promise<LeadRow | undefined> {
  const { rows } = await query<LeadRow>(sql("get_one"), [id], executor);
  return rows[0];
}

export async function getAll(executor?: Executor): Promise<LeadRow[]> {
  const { rows } = await query<LeadRow>(sql("get_all"), [], executor);
  return rows;
}

export async function create(id: string, lead: NewLead, executor?: Executor): Promise<LeadRow> {
  const { rows } = await query<LeadRow>(
    sql("create"),
    [id, lead.name, lead.phone, lead.email, lead.created_by, lead.updated_by,
     lead.priority, lead.notes ?? null],
    executor
  );
  return rows[0];
}

export async function update(
  lead: LeadRow,
  user_name: string,
  executor?: Executor
): Promise<LeadRow | undefined> {
  const { rows } = await query<LeadRow>(
    sql("update"),
    [lead.name, lead.phone, lead.email, user_name, lead.last_contacted,
     lead.converted, lead.contacted, lead.responded, lead.contact,
     lead.notes, lead.priority, lead.id],
    executor
  );
  return rows[0];
}

export async function remove(id: string, executor?: Executor): Promise<number> {
  const result = await query(sql("delete"), [id], executor);
  return result.rowCount ?? 0;
}
