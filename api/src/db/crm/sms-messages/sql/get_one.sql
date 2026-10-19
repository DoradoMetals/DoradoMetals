SELECT id, direction, provider, provider_sid, from_number, to_number, body, media,
       status, error_code, user_id, received_at, sent_at,
       created_at, updated_at, created_by_id, updated_by_id, read_at,
       ARRAY(SELECT l.image_id::text
               FROM crm.sms_message_images l
              WHERE l.message_id = crm.sms_messages.id
              ORDER BY l.sort_order, l.image_id) AS image_ids
  FROM crm.sms_messages
 WHERE id = $1
