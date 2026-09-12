-- Matched by user_id when the caller holds one, else by either number the
-- conversation runs on.
UPDATE crm.calls
   SET read_at = now()
 WHERE direction = 'inbound' AND read_at IS NULL
   AND (
     ($1::uuid IS NOT NULL AND user_id = $1)
     OR ($1::uuid IS NULL AND $2::text IS NOT NULL AND (from_number = $2 OR to_number = $2))
   )
