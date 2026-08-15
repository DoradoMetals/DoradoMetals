// Leads read from core.leads, the domain-namespaced schema the API is moving
// to. Identical to repo.exchange.js apart from the table it names; the columns
// match one for one after migration 002 added priority.
//
// Which of the two is used is decided by repo.js at import time.
import query from "#shared/db/query.js";

export async function getLead(id) {
  const sql = `
    SELECT *
    FROM core.leads
    WHERE id = $1
  `;
  const values = [id];
  const result = await query(sql, values);
  return result.rows[0];
}

export async function getAllLeads() {
  const sql = `
    SELECT *
    FROM core.leads
    ORDER BY created_at DESC
  `;
  const result = await query(sql, []);
  return result.rows;
}

export async function createLead(lead) {
  const sql = `
    INSERT INTO core.leads
      (name, phone, email, created_by, updated_by, priority, notes, last_contacted)
    VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'Medium'), $7, NOW())
    RETURNING *;
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
  const result = await query(sql, values);
  return result.rows[0];
}

export async function updateLead(lead, user_name) {
  const sql = `
    UPDATE core.leads
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
    RETURNING *;
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

  const result = await query(sql, values);
  return result.rows[0];
}

export async function deleteLead(id) {
  const sql = `
    DELETE FROM core.leads WHERE id = $1
  `;
  const values = [id];
  return await query(sql, values);
}
