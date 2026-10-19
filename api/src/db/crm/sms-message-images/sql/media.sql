-- The pictures a text message carries, in order, each with the content type
-- the provider is told.
SELECT l.image_id, i.mime_type AS content_type
  FROM crm.sms_message_images l
  JOIN media.images i ON i.id = l.image_id
 WHERE l.message_id = $1
 ORDER BY l.sort_order, l.image_id
