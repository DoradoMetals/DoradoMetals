SELECT id, direction, provider, provider_sid, from_number, to_number, body, media,
       status, error_code, user_id, received_at, sent_at,
       created_at, updated_at, created_by_id, updated_by_id, read_at
  FROM crm.sms_messages
 WHERE provider_sid = $1
