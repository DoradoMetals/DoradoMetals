-- Link an image to a text message at the end of its set (ruling 161). Linking
-- the same image twice is a no-op.
INSERT INTO crm.sms_message_images (message_id, image_id, sort_order)
SELECT $1, $2, COALESCE(max(sort_order) + 1, 0)
  FROM crm.sms_message_images
 WHERE message_id = $1
ON CONFLICT DO NOTHING
