-- Locks the row before an order-tolerant status decision is made, so two
-- concurrent Twilio status callbacks for the same message cannot both read
-- the pre-update status and both decide to apply.
SELECT id, direction, provider, provider_sid, from_number, to_number, body, media,
       status, error_code, user_id, received_at, sent_at,
       created_at, updated_at, created_by_id, updated_by_id
  FROM crm.sms_messages
 WHERE provider_sid = $1
   FOR UPDATE
