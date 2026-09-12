-- The conversation with one customer, both directions, oldest first (newest
-- last) so the caller renders it top-to-bottom as a chat log. Filtered by
-- user_id when the caller holds one, else by either number the customer might
-- be texting from or to - a number is not yet a user until it is verified.
SELECT id, direction, provider, provider_sid, from_number, to_number, body, media,
       status, error_code, user_id, received_at, sent_at,
       created_at, updated_at, created_by_id, updated_by_id, read_at
  FROM crm.sms_messages
 WHERE ($1::uuid IS NOT NULL AND user_id = $1)
    OR ($1::uuid IS NULL AND $2::text IS NOT NULL AND (from_number = $2 OR to_number = $2))
 ORDER BY created_at ASC, id
