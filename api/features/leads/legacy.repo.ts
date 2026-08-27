// exchange.leads, and nothing else. THIS FILE IS SCHEDULED FOR DELETION.
//
// It exists for one reason: exchange remains the record of truth until the
// migration is finished, so every write still has to land there. Reads do NOT
// come through here - they come from leads.leads via repo.ts, which is the
// point of this phase: the new schema is exercised by real traffic while
// exchange stays a complete, current replica.
//
// Deleting this file, and the calls to it in service.ts, is the cutover. That
// is a one-way door - exchange stops being updated the moment it happens - so
// it is deliberately a separate change, made when nothing needs to fall back.
//
// It returns only ids. Nothing above it should be tempted to read a value from
// exchange, because the whole direction of travel is that it stops being read.
import query from "#shared/db/query.js";
import { sqlFrom } from "#shared/db/sql.ts";
import type { LeadRow, NewLead, Executor } from "#features/leads/repo.ts";

const sql = sqlFrom(import.meta.dirname);

export async function create(id: string, lead: NewLead, executor?: Executor): Promise<void> {
  await query(
    sql("legacy/create"),
    [id, lead.name, lead.phone, lead.email, lead.created_by, lead.updated_by,
     lead.priority, lead.notes ?? null],
    executor
  );
}

export async function update(lead: LeadRow, user_name: string, executor?: Executor): Promise<void> {
  await query(
    sql("legacy/update"),
    [lead.name, lead.phone, lead.email, user_name, lead.last_contacted,
     lead.converted, lead.contacted, lead.responded, lead.contact,
     lead.notes, lead.priority, lead.id],
    executor
  );
}

export async function remove(id: string, executor?: Executor): Promise<void> {
  await query(sql("legacy/delete"), [id], executor);
}
