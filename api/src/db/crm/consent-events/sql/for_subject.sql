-- One subject's consent history, newest first. $1 is a customer id and $2 a
-- lead id; exactly one of them is given, which the one-subject CHECK on the
-- table mirrors. This is the A2P/TCPA record: it answers when consent was
-- given AND when it was withdrawn, which the current-state columns on
-- auth.users and leads.leads cannot.
SELECT e.id, e.user_id, e.lead_id, e.kind_id, e.method, e.at,
       e.created_at, e.updated_at, e.created_by_id, e.updated_by_id
  FROM crm.sms_consent_events e
 WHERE ($1::uuid IS NOT NULL AND e.user_id = $1)
    OR ($2::uuid IS NOT NULL AND e.lead_id = $2)
 ORDER BY e.at DESC, e.id DESC
