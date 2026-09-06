-- Only the real provider_sid and the send time are written here. The send
-- API's own status field ("accepted", "queued", ...) is not one string across
-- Twilio API versions and crm.sms_status is a strict enum - trusting it would
-- risk 22P02 on a label the enum does not carry. The row stays 'queued' until
-- the status webhook, whose values ARE the enum's own labels, corrects it.
UPDATE crm.sms_messages
   SET provider_sid = $2,
       sent_at = now()
 WHERE id = $1
RETURNING id, direction, provider, provider_sid, from_number, to_number, body, media,
          status, error_code, user_id, received_at, sent_at,
          created_at, updated_at, created_by_id, updated_by_id
