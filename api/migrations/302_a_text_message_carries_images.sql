-- A TEXT MESSAGE CARRIES IMAGES BOTH WAYS (ruling 161).
--
-- crm.sms_message_images is a pure link between a crm.sms_messages row and a
-- media.images row, ordered by sort_order. An outbound MMS links the images the
-- sender attached; an inbound MMS links the media.images row written for each
-- MediaUrl the Twilio webhook carried.
--
-- (message_id, sort_order) is unique: an inbound picture's position is its
-- MediaUrl index, so two deliveries of one webhook race to one link and the
-- loser's insert does nothing.
--
-- Purely additive. `exchange` is neither read nor written.

CREATE TABLE IF NOT EXISTS crm.sms_message_images (
  message_id uuid NOT NULL,
  image_id uuid NOT NULL,
  sort_order integer NOT NULL
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sms_message_images_pkey') THEN
    ALTER TABLE crm.sms_message_images ADD CONSTRAINT sms_message_images_pkey
      PRIMARY KEY (message_id, image_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'sms_message_images_message_id_fkey') THEN
    ALTER TABLE crm.sms_message_images ADD CONSTRAINT sms_message_images_message_id_fkey
      FOREIGN KEY (message_id) REFERENCES crm.sms_messages (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'sms_message_images_image_id_fkey') THEN
    ALTER TABLE crm.sms_message_images ADD CONSTRAINT sms_message_images_image_id_fkey
      FOREIGN KEY (image_id) REFERENCES media.images (id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS sms_message_images_message_sort
  ON crm.sms_message_images (message_id, sort_order);
CREATE INDEX IF NOT EXISTS sms_message_images_image ON crm.sms_message_images (image_id);
