UPDATE crm.sms_messages
   SET status = $2::crm.sms_status,
       error_code = $3
 WHERE id = $1
RETURNING id, direction, provider, provider_sid, from_number, to_number, body, media,
          status, error_code, user_id, received_at, sent_at,
          created_at, updated_at, created_by_id, updated_by_id, read_at
