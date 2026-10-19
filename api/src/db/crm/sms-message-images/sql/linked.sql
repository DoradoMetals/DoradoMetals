-- Whether a text message already holds a picture at a position.
SELECT EXISTS (
  SELECT 1 FROM crm.sms_message_images WHERE message_id = $1 AND sort_order = $2
) AS linked
