-- One row per consent decision, in either direction. The KIND is a row
-- (crm.sms_consent_kinds), so the caller sends its key and the id is resolved
-- here rather than through a TypeScript map: $3 is 'opt_in' or 'opt_out'.
-- `at`, created_at, updated_at and the actor are stamped by the database.
INSERT INTO crm.sms_consent_events (user_id, lead_id, kind_id, method)
SELECT $1, $2, k.id, $4
  FROM crm.sms_consent_kinds k
 WHERE k.key = $3
RETURNING id, user_id, lead_id, kind_id, method, at,
          created_at, updated_at, created_by_id, updated_by_id
