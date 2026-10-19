-- Ruling 162: a lead is archived, never deleted. A lead already archived is
-- not stamped again, so a second archive changes no row.
UPDATE leads.leads
   SET archived_at = now()
 WHERE id = $1
   AND archived_at IS NULL
