-- One lead, by id. Columns are listed rather than *: created_by_id/updated_by_id must not reach the wire.
SELECT id, name, phone, email, created_at, updated_at, last_contacted,
       converted, contacted, responded, created_by, updated_by,
       notes, contact, priority
  FROM leads.leads
 WHERE id = $1
