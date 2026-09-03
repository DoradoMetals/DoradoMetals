-- One lead, by id.
--
-- Columns are listed rather than selected with *: leads.leads carries
-- created_by_id and updated_by_id, which exchange has no equivalent for, and
-- they must not reach the wire while both schemas are serving.
SELECT id, name, phone, email, created_at, updated_at, last_contacted,
       converted, contacted, responded, created_by, updated_by,
       notes, contact, priority
  FROM leads.leads
 WHERE id = $1
