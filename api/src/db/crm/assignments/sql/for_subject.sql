-- One subject's assignment history, newest first. $1 is a customer id and $2
-- a lead id; exactly one of them is given, which the one-subject CHECK on the
-- table mirrors.
SELECT a.id, a.user_id, a.lead_id, a.assigned_to_id, a.assigned_at,
       a.created_at, a.updated_at, a.created_by_id, a.updated_by_id
  FROM crm.assignments a
 WHERE ($1::uuid IS NOT NULL AND a.user_id = $1)
    OR ($2::uuid IS NOT NULL AND a.lead_id = $2)
 ORDER BY a.assigned_at DESC, a.id DESC
