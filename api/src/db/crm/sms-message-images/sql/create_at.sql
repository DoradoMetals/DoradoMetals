-- Link an image to a text message at a given position - an inbound picture's
-- MediaUrl index (ruling 161). (message_id, sort_order) is unique, so a second
-- delivery of the same webhook links nothing.
INSERT INTO crm.sms_message_images (message_id, image_id, sort_order)
VALUES ($1, $2, $3)
ON CONFLICT DO NOTHING
