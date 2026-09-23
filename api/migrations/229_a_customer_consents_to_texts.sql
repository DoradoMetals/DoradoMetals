-- A2P 10DLC campaign registration needs a consent fact on the account: when a
-- customer checks the sign-up (or checkout) box, the server stamps the
-- moment, never a value the client sent. An inbound STOP clears it; START
-- re-sets it. sms_consent_method records how consent was given so a lead
-- converted with verbal consent (docs/design/a2p-campaign.md) reads the same
-- way a web-form checkbox does.
--
-- auth.pending_signups.sms_consent holds the checkbox answer between the
-- sign-up call and the code that materializes the account - the same
-- pattern name and email already use on that table.
--
-- Purely additive. `exchange` is neither read nor written.

ALTER TABLE auth.users
  ADD COLUMN IF NOT EXISTS sms_consent_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS sms_consent_method text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'users_sms_consent_method_is_known'
       AND conrelid = 'auth.users'::regclass
  ) THEN
    ALTER TABLE auth.users ADD CONSTRAINT users_sms_consent_method_is_known
      CHECK (sms_consent_method IS NULL OR sms_consent_method IN ('web_form', 'verbal'));
  END IF;
END $$;

ALTER TABLE auth.pending_signups
  ADD COLUMN IF NOT EXISTS sms_consent boolean NOT NULL DEFAULT false;
