// Leads read from leads.leads, the domain-namespaced schema the API is moving
// to. Which of the two implementations is used is decided by repo.js.
//
// This is the first file converted to TypeScript. The pattern is that a feature
// arrives typed when it moves schema, rather than the conversion being a
// separate pass over the whole API: the row type comes from the generated
// contract, so it is whatever the database actually says rather than a
// hand-written guess that drifts.
//
// Reads project explicit columns rather than SELECT *: leads.leads carries
// created_by_id and updated_by_id, which exchange has no equivalent for, and
// they must not appear on the wire while both schemas are serving.
//
// Node runs this directly by stripping types - there is no build step. Type
// checking is separate and happens in CI via tsc --noEmit.
import query from "#shared/db/query.js";
import type { leads } from "@dorado/contracts";
import type { PoolClient } from "pg";

export type LeadRow = leads.LeadsRow;

// Repos take an optional executor so a caller can pull them into its
// transaction; without one they run on the pool.
type Executor = PoolClient | undefined;

// What a caller may supply when creating a lead. The database fills id,
// timestamps and the columns that carry defaults.
export type NewLead = Pick<LeadRow, "name" | "phone" | "email"> &
  Partial<Pick<LeadRow, "created_by" | "updated_by" | "priority" | "notes">>;

export async function getLead(
  id: string,
  executor?: Executor
): Promise<LeadRow | undefined> {
  const sql = `
    SELECT id, name, phone, email, created_at, updated_at, last_contacted,
           converted, contacted, responded, created_by, updated_by, notes, contact, priority
    FROM leads.leads
    WHERE id = $1
  `;
  const result = await query<LeadRow>(sql, [id], executor);
  return result.rows[0];
}

export async function getAllLeads(executor?: Executor): Promise<LeadRow[]> {
  const sql = `
    SELECT id, name, phone, email, created_at, updated_at, last_contacted,
           converted, contacted, responded, created_by, updated_by, notes, contact, priority
    FROM leads.leads
    ORDER BY created_at DESC, id DESC
  `;
  const result = await query<LeadRow>(sql, [], executor);
  return result.rows;
}

export async function createLead(
  lead: NewLead,
  executor?: Executor
): Promise<LeadRow> {
  const sql = `
    INSERT INTO leads.leads
      (name, phone, email, created_by, updated_by, priority, notes, last_contacted)
    VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'Medium'), $7, NOW())
    RETURNING id, name, phone, email, created_at, updated_at, last_contacted,
           converted, contacted, responded, created_by, updated_by, notes, contact, priority;
  `;
  const values = [
    lead.name,
    lead.phone,
    lead.email,
    lead.created_by,
    lead.updated_by,
    lead.priority,
    lead.notes ?? null,
  ];
  const result = await query<LeadRow>(sql, values, executor);
  return result.rows[0];
}

export async function updateLead(
  lead: LeadRow,
  user_name: string,
  executor?: Executor
): Promise<LeadRow> {
  const sql = `
    UPDATE leads.leads
    SET name = $1,
        phone = $2,
        email = $3,
        updated_at = NOW(),
        updated_by = $4,
        last_contacted = $5,
        converted = $6,
        contacted = $7,
        responded = $8,
        contact = $9,
        notes = $10,
        priority = $11
    WHERE id = $12
    RETURNING id, name, phone, email, created_at, updated_at, last_contacted,
           converted, contacted, responded, created_by, updated_by, notes, contact, priority;
  `;
  const values = [
    lead.name,
    lead.phone,
    lead.email,
    user_name,
    lead.last_contacted,
    lead.converted,
    lead.contacted,
    lead.responded,
    lead.contact,
    lead.notes,
    lead.priority,
    lead.id,
  ];
  const result = await query<LeadRow>(sql, values, executor);
  return result.rows[0];
}

export async function deleteLead(id: string, executor?: Executor) {
  const sql = `
    DELETE FROM leads.leads WHERE id = $1
  `;
  return await query(sql, [id], executor);
}

// Copies a row from exchange.leads, id included, creating or overwriting.
//
// The copy happens server-side rather than by handing this function a row that
// has already been through JavaScript. pg materialises a timestamp as a JS
// Date, which has millisecond precision, so a read-then-write round trip
// silently truncates the microseconds Postgres stores. That is how the January
// bulk copy lost sub-millisecond precision on every timestamp it moved.
export async function mirrorLead(
  id: string,
  executor?: Executor
): Promise<LeadRow> {
  const cols = `id, name, phone, email, created_at, updated_at, last_contacted,
                converted, contacted, responded, created_by, updated_by,
                notes, contact, priority`;
  const sql = `
    INSERT INTO leads.leads (${cols})
    SELECT ${cols} FROM exchange.leads WHERE id = $1
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name, phone = EXCLUDED.phone, email = EXCLUDED.email,
      created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at,
      last_contacted = EXCLUDED.last_contacted, converted = EXCLUDED.converted,
      contacted = EXCLUDED.contacted, responded = EXCLUDED.responded,
      created_by = EXCLUDED.created_by, updated_by = EXCLUDED.updated_by,
      notes = EXCLUDED.notes, contact = EXCLUDED.contact,
      priority = EXCLUDED.priority
    RETURNING ${cols};
  `;
  const result = await query<LeadRow>(sql, [id], executor);
  return result.rows[0];
}
