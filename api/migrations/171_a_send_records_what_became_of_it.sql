-- The paper trail recorded whether a send was ACCEPTED by the provider and
-- nothing after that. Resend reports what became of the message on its own
-- webhook - delivered, bounced, complained - and those four columns are where
-- that lands. `status` is unchanged and still means "the provider took it":
-- media/emails/sql/has_sent.sql keys the once-per-order mailers on it, and a
-- bounce must not make an order mailer eligible to send a second time.
--
-- Two indexes, both for lookups the new code makes: the webhook seeks the row
-- by the id Resend returned, and the promo suppression rule seeks every row an
-- address has. Additive; `exchange` is neither read nor written.

ALTER TABLE media.emails ADD COLUMN IF NOT EXISTS delivered_at timestamp with time zone;
ALTER TABLE media.emails ADD COLUMN IF NOT EXISTS bounced_at timestamp with time zone;
ALTER TABLE media.emails ADD COLUMN IF NOT EXISTS bounce_reason text;
ALTER TABLE media.emails ADD COLUMN IF NOT EXISTS complained_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS emails_provider_message_idx
  ON media.emails USING btree (provider_message_id);

CREATE INDEX IF NOT EXISTS emails_address_idx
  ON media.emails USING btree (to_address);
